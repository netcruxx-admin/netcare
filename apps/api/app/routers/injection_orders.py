"""Injection orders — shots a doctor orders and a nurse gives.

The injection counterpart of `medication_orders`, one step shorter: there is no
pharmacist dispense in the middle. A single-dose injectable is consumed at the
moment it is administered, so the nurse's `administer` call is what moves stock
(refusing on short or expired stock, exactly as a dispense would). Pharmacy
still owns the catalogue and restocking, over in `injectables`.

Flow: doctor POSTs an order (`ordered`) → nurse PATCHes `/administer`
(`administered`, stock moves, doctor is notified) → or someone PATCHes
`/cancel`. `DELETE` is the platform's.
"""

from typing import Optional
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, aliased

from .. import models, notify, schemas
from ..auth import get_current_user
from ..authz import SCOPE_OWN, require_permission
from ..database import get_db
from ..tenancy import assert_body_in_tenant, get_tenant_id, scoped
from ..utils import ListQuery, list_params, new_id, now_iso, paginate

router = APIRouter(prefix="/injection-orders", tags=["injection_orders"])


@router.get("", response_model=list[schemas.InjectionOrderOut])
def list_injection_orders(
    response: Response,
    patient_id: Optional[str] = Query(default=None, alias="patientId"),
    doctor_id: Optional[str] = Query(default=None, alias="doctorId"),
    appointment_id: Optional[str] = Query(default=None, alias="appointmentId"),
    status_filter: Optional[str] = Query(default=None, alias="status"),
    params: ListQuery = Depends(list_params),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
    scope: str = Depends(require_permission("injection_orders.read")),
    tenant_id: str = Depends(get_tenant_id),
):
    query = scoped(db, models.InjectionOrder, tenant_id)
    if scope == SCOPE_OWN:
        query = query.filter(models.InjectionOrder.doctor_id == _caller_doctor_id(db, user, tenant_id))
    if patient_id:
        query = query.filter(models.InjectionOrder.patient_id == patient_id)
    if doctor_id:
        query = query.filter(models.InjectionOrder.doctor_id == doctor_id)
    if appointment_id:
        query = query.filter(models.InjectionOrder.appointment_id == appointment_id)
    if status_filter:
        wanted = [s.strip() for s in status_filter.split(",") if s.strip()]
        query = query.filter(models.InjectionOrder.status.in_(wanted))
    if params.q:
        like = f"%{params.q.strip().lower()}%"
        pat_user = aliased(models.User)
        query = (
            query
            .outerjoin(models.Patient, models.Patient.id == models.InjectionOrder.patient_id)
            .outerjoin(pat_user, pat_user.id == models.Patient.user_id)
            .filter(or_(
                func.lower(models.InjectionOrder.injectable_name).like(like),
                func.lower(models.InjectionOrder.patient_id).like(like),
                func.lower(pat_user.name).like(like),
                func.lower(models.Patient.phone).like(like),
            ))
        )
    query = query.order_by(models.InjectionOrder.ordered_at.desc())
    rows = paginate(query, response, params.limit, params.offset).all()
    return [_enrich(db, tenant_id, o) for o in rows]


@router.post("", response_model=schemas.InjectionOrderOut, status_code=status.HTTP_201_CREATED)
def create_injection_order(
    body: schemas.InjectionOrderCreate,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
    _: str = Depends(require_permission("injection_orders.manage")),
    tenant_id: str = Depends(get_tenant_id),
):
    assert_body_in_tenant(db, body, tenant_id)

    # Whose name goes on the order. The permission is the authorization; this is
    # only about the prescriber. A doctor's own id always wins over the body — a
    # fact about what happened is not the client's to assert.
    caller_doctor = (
        scoped(db, models.Doctor, tenant_id)
        .filter(models.Doctor.user_id == user.id)
        .first()
    )
    if caller_doctor is not None:
        doctor_id = caller_doctor.id
    elif body.doctor_id:
        doctor_id = body.doctor_id
    else:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Name the ordering doctor",
        )

    fields = body.model_dump()
    fields.pop("doctor_id", None)
    order = models.InjectionOrder(
        id=new_id("injord"),
        hospital_id=tenant_id,
        doctor_id=doctor_id,
        ordered_at=now_iso(),
        **fields,
    )
    db.add(order)
    db.commit()
    db.refresh(order)
    return _enrich(db, tenant_id, order)


@router.patch("/{order_id}/administer", response_model=schemas.InjectionOrderOut)
def administer_injection_order(
    order_id: str,
    body: schemas.InjectionAdministerBody,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
    _: str = Depends(require_permission("injection_orders.administer")),
    tenant_id: str = Depends(get_tenant_id),
):
    order = (
        scoped(db, models.InjectionOrder, tenant_id)
        .filter(models.InjectionOrder.id == order_id)
        .first()
    )
    if order is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found")
    if order.status != "ordered":
        raise HTTPException(status.HTTP_409_CONFLICT, f"Order is already {order.status}")
    if not (body.site or "").strip():
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Record the injection site (e.g. Left deltoid, IV line A)",
        )

    wanted = body.quantity or order.quantity or 1
    crossed_low_stock = False
    item = None
    # Move stock only when the order names a catalogued injectable. A free-text
    # order ("bring a vial of X from the ward fridge") still records the
    # administration, it just moves no inventory.
    if order.injectable_id:
        item = (
            scoped(db, models.Injectable, tenant_id)
            .filter(models.Injectable.id == order.injectable_id)
            .first()
        )
        if item is None:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "That injectable is no longer in the catalogue",
            )
        if item.expiry_date and item.expiry_date < date.today().isoformat():
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                f"{item.name} expired on {item.expiry_date} — it cannot be given. "
                "Write the expired stock off and restock.",
            )
        if item.stock < wanted:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                f"Only {item.stock} in stock — this shot needs {wanted}. "
                "Restock before administering.",
            )
        stock_before = item.stock
        item.stock -= wanted
        db.add(
            models.InjectionStockMovement(
                id=new_id("injmv"),
                hospital_id=tenant_id,
                injectable_id=order.injectable_id,
                movement_type="administer",
                quantity=-wanted,
                reference_id=order_id,
                performed_by=user.id,
                created_at=now_iso(),
            )
        )
        crossed_low_stock = stock_before > item.reorder_level >= item.stock

    # Set last, so a refusal above leaves the order administerable once stock
    # is back.
    order.status = "administered"
    order.quantity = wanted
    order.site = body.site.strip()
    if body.notes:
        order.notes = body.notes
    order.administered_by = user.id
    order.administered_at = now_iso()
    db.commit()
    db.refresh(order)

    # Billing is automatic, not a separate step the nurse takes: the shot is
    # given, so a pending injectable Payment appears on the Billing screen for
    # the front desk to collect. The amount is `injectable.price × quantity
    # given`; an uncatalogued injectable bills at ₹0 for the desk to reconcile.
    db.add(models.Payment(
        id=new_id("pay"),
        hospital_id=tenant_id,
        appointment_id=None,
        injection_order_id=order_id,
        patient_id=order.patient_id,
        amount=round((item.price or 0.0) * wanted, 2) if item else 0.0,
        payment_type="injectable",
        status="pending",
        payment_method="",
        created_at=now_iso(),
    ))
    db.commit()

    notify.notify_doctor(
        db, tenant_id, order.doctor_id,
        title="Injection administered",
        body=(
            f"{order.injectable_name} was given to your patient."
            if order.injectable_name else
            "An injection you ordered was given."
        ),
        data={"type": "injection_order", "orderId": order.id, "url": "/dashboard/injection-orders"},
    )
    if crossed_low_stock and item is not None:
        notify.notify_role(
            db, tenant_id, "pharmacist",
            title="Low stock",
            body=f"{item.name} is down to {item.stock} unit(s) (reorder level {item.reorder_level}).",
            data={"type": "low_stock", "injectableId": item.id, "url": "/dashboard/injections"},
        )
    return _enrich(db, tenant_id, order)


@router.patch("/{order_id}/cancel", response_model=schemas.InjectionOrderOut)
def cancel_injection_order(
    order_id: str,
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("injection_orders.manage")),
    tenant_id: str = Depends(get_tenant_id),
):
    order = (
        scoped(db, models.InjectionOrder, tenant_id)
        .filter(models.InjectionOrder.id == order_id)
        .first()
    )
    if order is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found")
    if order.status in ("administered", "cancelled"):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Cannot cancel an order that is already {order.status}",
        )
    order.status = "cancelled"
    db.commit()
    db.refresh(order)
    return _enrich(db, tenant_id, order)


@router.delete("/{order_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_injection_order(
    order_id: str,
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("injection_orders.delete")),
    tenant_id: str = Depends(get_tenant_id),
):
    order = (
        scoped(db, models.InjectionOrder, tenant_id)
        .filter(models.InjectionOrder.id == order_id)
        .first()
    )
    if order is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found")
    db.delete(order)
    db.commit()


def _caller_doctor_id(db: Session, user: models.User, tenant_id: str) -> str:
    doc = scoped(db, models.Doctor, tenant_id).filter(models.Doctor.user_id == user.id).first()
    return doc.id if doc else ""


def _enrich(db: Session, tenant_id: str, order: models.InjectionOrder) -> schemas.InjectionOrderOut:
    """Resolve patient/doctor/nurse names and current catalogue stock for the
    list and queue views."""
    result = schemas.InjectionOrderOut.model_validate(order)
    pat = scoped(db, models.Patient, tenant_id).filter(models.Patient.id == order.patient_id).first()
    if pat:
        result.patient_phone = pat.phone or ""
        u = db.query(models.User).filter(models.User.id == pat.user_id).first()
        if u:
            result.patient_name = u.name
    doc = scoped(db, models.Doctor, tenant_id).filter(models.Doctor.id == order.doctor_id).first()
    if doc:
        u = db.query(models.User).filter(models.User.id == doc.user_id).first()
        if u:
            result.doctor_name = u.name
    if order.administered_by:
        u = db.query(models.User).filter(models.User.id == order.administered_by).first()
        if u:
            result.administered_by_name = u.name
    if order.injectable_id:
        item = (
            scoped(db, models.Injectable, tenant_id)
            .filter(models.Injectable.id == order.injectable_id)
            .first()
        )
        if item:
            result.stock_on_hand = item.stock
    return result
