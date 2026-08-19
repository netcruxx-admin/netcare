"""Medication orders — in-hospital drug orders raised by doctors, dispensed by
pharmacists, administered by nurses. Distinct from take-home prescriptions."""

from typing import Optional
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
    doctor = scoped(db, models.Doctor, tenant_id).filter(models.Doctor.user_id == user.id).first()
    if doctor is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only doctors may raise medication orders")
    order = models.MedicationOrder(
        id=new_id("mord"),
        hospital_id=tenant_id,
        doctor_id=doctor.id,
        ordered_at=now_iso(),
        **body.model_dump(),
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
    order.status = "dispensed"
    # Deduct stock if medicine_id is set
    if order.medicine_id:
        med = scoped(db, models.Medicine, tenant_id).filter(models.Medicine.id == order.medicine_id).first()
        if med and med.stock > 0:
            med.stock = max(0, med.stock - 1)
            movement = models.InventoryMovement(
                id=new_id("inv"),
                hospital_id=tenant_id,
                medicine_id=order.medicine_id,
                movement_type="dispense",
                quantity=-1,
                reference_id=order_id,
                performed_by=user.id,
                created_at=now_iso(),
            )
            db.add(movement)
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


def _get_doctor_id(db: Session, user: models.User, tenant_id: str) -> str:
    doc = scoped(db, models.Doctor, tenant_id).filter(models.Doctor.user_id == user.id).first()
    return doc.id if doc else ""


def _enrich(db: Session, tenant_id: str, order: models.MedicationOrder) -> schemas.MedicationOrderOut:
    """Resolve patient_name and doctor_name so the list needs no extra fetches."""
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
    return result
