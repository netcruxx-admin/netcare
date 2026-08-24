"""Medication orders — in-hospital drug orders raised by doctors, dispensed by
pharmacists, administered by nurses. Distinct from take-home prescriptions."""

from typing import Optional
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, aliased

from .. import models, schemas
from ..auth import get_current_user
from ..authz import SCOPE_OWN, require_permission
from ..database import get_db
from ..tenancy import assert_body_in_tenant, get_tenant_id, scoped
from ..utils import ListQuery, list_params, new_id, now_iso, paginate, text_search

router = APIRouter(prefix="/medication-orders", tags=["medication_orders"])


@router.get("", response_model=list[schemas.MedicationOrderOut])
def list_medication_orders(
    response: Response,
    patient_id: Optional[str] = Query(default=None, alias="patientId"),
    doctor_id: Optional[str] = Query(default=None, alias="doctorId"),
    appointment_id: Optional[str] = Query(default=None, alias="appointmentId"),
    status_filter: Optional[str] = Query(default=None, alias="status"),
    params: ListQuery = Depends(list_params),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
    scope: str = Depends(require_permission("medication_orders.read")),
    tenant_id: str = Depends(get_tenant_id),
):
    query = scoped(db, models.MedicationOrder, tenant_id)
    if scope == SCOPE_OWN:
        query = query.filter(models.MedicationOrder.doctor_id == _get_doctor_id(db, user, tenant_id))
    if patient_id:
        query = query.filter(models.MedicationOrder.patient_id == patient_id)
    if doctor_id:
        query = query.filter(models.MedicationOrder.doctor_id == doctor_id)
    if appointment_id:
        query = query.filter(models.MedicationOrder.appointment_id == appointment_id)
    if status_filter:
        wanted = [s.strip() for s in status_filter.split(",") if s.strip()]
        query = query.filter(models.MedicationOrder.status.in_(wanted))
    if params.q:
        like = f"%{params.q.strip().lower()}%"
        pat_user = aliased(models.User)
        query = (
            query
            .outerjoin(models.Patient, models.Patient.id == models.MedicationOrder.patient_id)
            .outerjoin(pat_user, pat_user.id == models.Patient.user_id)
            .filter(or_(
                func.lower(models.MedicationOrder.medicine_name).like(like),
                func.lower(models.MedicationOrder.patient_id).like(like),
                func.lower(pat_user.name).like(like),
                func.lower(models.Patient.phone).like(like),
            ))
        )
    query = query.order_by(models.MedicationOrder.ordered_at.desc())
    rows = paginate(query, response, params.limit, params.offset).all()
    return [_enrich(db, tenant_id, o) for o in rows]


@router.post("", response_model=schemas.MedicationOrderOut, status_code=status.HTTP_201_CREATED)
def create_medication_order(
    body: schemas.MedicationOrderCreate,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
    _: str = Depends(require_permission("medication_orders.manage")),
    tenant_id: str = Depends(get_tenant_id),
):
    # Every foreign key on the body, checked against the caller's tenant.
    # Without this a row filed here can point at another hospital's records,
    # and the display helpers then resolve that id to a real name.
    assert_body_in_tenant(db, body, tenant_id)

    # Who prescribed this. Previously a hard `if not a doctor: 403`, which made
    # the grant to pharmacist a lie — they held medication_orders.manage and
    # were refused anyway. The permission is the authorization; this is only
    # about whose name goes on the order.
    caller_doctor = (
        scoped(db, models.Doctor, tenant_id)
        .filter(models.Doctor.user_id == user.id)
        .first()
    )
    if caller_doctor is not None:
        # The caller is the prescriber. Their own id wins over anything the
        # body claims — a doctor cannot file an order under someone else's name.
        doctor_id = caller_doctor.id
    elif body.doctor_id:
        # A pharmacist recording a prescription written by someone else. The id
        # is already checked against the tenant by assert_body_in_tenant above.
        doctor_id = body.doctor_id
    else:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Name the prescribing doctor",
        )

    # One prescription, one order. Without this, sending the same prescription
    # to the queue twice would dispense it twice and take the stock twice.
    if body.prescription_id:
        clash = (
            scoped(db, models.MedicationOrder, tenant_id)
            .filter(
                models.MedicationOrder.prescription_id == body.prescription_id,
                models.MedicationOrder.status != "cancelled",
            )
            .first()
        )
        if clash is not None:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "That prescription is already in the dispense queue",
            )

    fields = body.model_dump()
    fields.pop("doctor_id", None)
    order = models.MedicationOrder(
        id=new_id("mord"),
        hospital_id=tenant_id,
        doctor_id=doctor_id,
        ordered_at=now_iso(),
        **fields,
    )
    db.add(order)
    db.commit()
    db.refresh(order)
    return _enrich(db, tenant_id, order)


@router.patch("/{order_id}/dispense", response_model=schemas.MedicationOrderOut)
def dispense_order(
    order_id: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
    _: str = Depends(require_permission("medication_orders.dispense")),
    tenant_id: str = Depends(get_tenant_id),
):
    order = scoped(db, models.MedicationOrder, tenant_id).filter(models.MedicationOrder.id == order_id).first()
    if order is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found")
    if order.status != "pending":
        raise HTTPException(status.HTTP_409_CONFLICT, f"Order is already {order.status}")
    # An order for a catalogued medicine moves stock by the quantity ordered.
    # This used to deduct exactly 1 whatever the order said, so a ten-tablet
    # course moved stock by one and inventory drifted from the first dispense.
    if order.medicine_id:
        med = (
            scoped(db, models.Medicine, tenant_id)
            .filter(models.Medicine.id == order.medicine_id)
            .first()
        )
        if med is None:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "That medicine is no longer in the catalogue",
            )
        # Expired stock must not reach a patient. The date is a plain ISO
        # string; a blank one means nobody recorded an expiry, which is not the
        # same as "does not expire" — so it is allowed through rather than
        # blocking every medicine that predates the field.
        if med.expiry_date and med.expiry_date < date.today().isoformat():
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                f"{med.name} expired on {med.expiry_date} — it cannot be dispensed. "
                "Record the expiry as a write-off and restock.",
            )

        wanted = order.quantity or 1
        # Refuse rather than dispense what is not there. The previous guard was
        # `if med.stock > 0`, which silently marked the order dispensed with no
        # stock movement and no inventory row — a discrepancy with no trace of
        # where it came from, which is the worst of both outcomes.
        if med.stock < wanted:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                f"Only {med.stock} in stock — this order needs {wanted}. "
                "Restock before dispensing.",
            )
        med.stock -= wanted
        db.add(
            models.InventoryMovement(
                id=new_id("inv"),
                hospital_id=tenant_id,
                medicine_id=order.medicine_id,
                movement_type="dispense",
                quantity=-wanted,
                reference_id=order_id,
                performed_by=user.id,
                created_at=now_iso(),
            )
        )

    # Set last, so a refusal above leaves the order pending and dispensable
    # once the shelf is restocked.
    order.status = "dispensed"
    db.commit()
    db.refresh(order)
    return _enrich(db, tenant_id, order)


@router.patch("/{order_id}/administer", response_model=schemas.MedicationOrderOut)
def administer_order(
    order_id: str,
    body: schemas.MedicationOrderUpdate,
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("medication_orders.administer")),
    tenant_id: str = Depends(get_tenant_id),
):
    order = scoped(db, models.MedicationOrder, tenant_id).filter(models.MedicationOrder.id == order_id).first()
    if order is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found")
    if order.status != "dispensed":
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Order must be dispensed by pharmacy before it can be administered"
            if order.status == "pending"
            else f"Order is already {order.status}",
        )
    order.status = "administered"
    # Combine site + notes into the notes field so we don't need an extra column.
    parts = []
    if body.site:
        parts.append(f"Site: {body.site}")
    if body.notes:
        parts.append(body.notes)
    if parts:
        order.notes = " | ".join(parts)
    db.commit()
    db.refresh(order)
    return _enrich(db, tenant_id, order)


@router.patch("/{order_id}/cancel", response_model=schemas.MedicationOrderOut)
def cancel_order(
    order_id: str,
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("medication_orders.manage")),
    tenant_id: str = Depends(get_tenant_id),
):
    order = scoped(db, models.MedicationOrder, tenant_id).filter(models.MedicationOrder.id == order_id).first()
    if order is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found")
    if order.status in ("administered", "cancelled"):
        raise HTTPException(status.HTTP_409_CONFLICT, f"Cannot cancel an order that is already {order.status}")
    order.status = "cancelled"
    db.commit()
    db.refresh(order)
    return _enrich(db, tenant_id, order)


@router.post("/{order_id}/bill", response_model=schemas.PharmacyBillOut)
def bill_dispensed_order(
    order_id: str,
    body: schemas.PharmacyBillBody,
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("medication_orders.dispense")),
    tenant_id: str = Depends(get_tenant_id),
):
    """Create a pharmacy Payment for a dispensed medication order.

    Only dispensed orders may be billed — a pending order is not yet in the
    patient's hands and a billed order must not be charged twice.
    The amount is `medicine.price × order.quantity`; orders for uncatalogued
    medicines (no medicine_id) bill at ₹0 and the pharmacist can reconcile
    manually.
    """
    order = scoped(db, models.MedicationOrder, tenant_id).filter(models.MedicationOrder.id == order_id).first()
    if order is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found")
    if order.status != "dispensed":
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Only dispensed orders can be billed"
            if order.status == "pending"
            else f"Order is already {order.status}",
        )
    # Check whether a payment already exists for this order.
    existing = (
        db.query(models.Payment)
        .filter(
            models.Payment.hospital_id == tenant_id,
            models.Payment.medication_order_id == order_id,
        )
        .first()
    )
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "This order has already been billed")

    unit_price: float = 0.0
    quantity = order.quantity or 1
    medicine_name = order.medicine_name or ""

    if order.medicine_id:
        med = (
            scoped(db, models.Medicine, tenant_id)
            .filter(models.Medicine.id == order.medicine_id)
            .first()
        )
        if med:
            unit_price = med.price or 0.0
            medicine_name = med.name

    amount = round(unit_price * quantity, 2)

    payment = models.Payment(
        id=new_id("pay"),
        hospital_id=tenant_id,
        appointment_id=None,
        medication_order_id=order_id,
        patient_id=order.patient_id,
        amount=amount,
        payment_type="pharmacy",
        status="completed",
        payment_method=body.payment_method,
        created_at=now_iso(),
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)

    return schemas.PharmacyBillOut(
        payment=schemas.PaymentOut.model_validate(payment),
        amount=amount,
        medicine_name=medicine_name,
        quantity=quantity,
        unit_price=unit_price,
    )


def _get_doctor_id(db: Session, user: models.User, tenant_id: str) -> str:
    doc = scoped(db, models.Doctor, tenant_id).filter(models.Doctor.user_id == user.id).first()
    return doc.id if doc else ""


def _enrich(db: Session, tenant_id: str, order: models.MedicationOrder) -> schemas.MedicationOrderOut:
    """Resolve patient_name, doctor_name, unit_price, and already_billed for list rendering."""
    result = schemas.MedicationOrderOut.model_validate(order)
    # Patient name
    pat = scoped(db, models.Patient, tenant_id).filter(models.Patient.id == order.patient_id).first()
    if pat:
        result.patient_phone = pat.phone or ""
        u = db.query(models.User).filter(models.User.id == pat.user_id).first()
        if u:
            result.patient_name = u.name
    # Doctor name
    doc = scoped(db, models.Doctor, tenant_id).filter(models.Doctor.id == order.doctor_id).first()
    if doc:
        u = db.query(models.User).filter(models.User.id == doc.user_id).first()
        if u:
            result.doctor_name = u.name
    # Unit price from the medicine catalogue (0 for free-text orders)
    if order.medicine_id:
        med = (
            scoped(db, models.Medicine, tenant_id)
            .filter(models.Medicine.id == order.medicine_id)
            .first()
        )
        if med:
            result.unit_price = med.price or 0.0
    # Whether a pharmacy payment already exists for this order
    existing_payment = (
        db.query(models.Payment)
        .filter(
            models.Payment.hospital_id == tenant_id,
            models.Payment.medication_order_id == order.id,
        )
        .first()
    )
    result.already_billed = existing_payment is not None
    return result
