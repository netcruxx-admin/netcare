from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import get_current_user
from ..authz import require_permission
from ..database import get_db
from ..tenancy import assert_body_in_tenant, get_tenant_id, scoped
from ..utils import ListQuery, list_params, new_id, now_iso, paginate, text_search

router = APIRouter(prefix="/video-slots", tags=["video-slots"])


@router.get("", response_model=list[schemas.VideoSlotOut])
def list_video_slots(
    response: Response,
    doctor_id: Optional[str] = Query(default=None, alias="doctorId"),
    slot_status: Optional[schemas.VideoSlotStatus] = Query(default=None, alias="status"),
    date: Optional[str] = Query(default=None, alias="date"),
    params: ListQuery = Depends(list_params),
    db: Session = Depends(get_db),
    scope: str = Depends(require_permission("video_consults.join")),
    tenant_id: str = Depends(get_tenant_id),
):
    query = scoped(db, models.VideoSlot, tenant_id)
    if doctor_id:
        query = query.filter(models.VideoSlot.doctor_id == doctor_id)
    if slot_status:
        query = query.filter(models.VideoSlot.status == slot_status)
    if date:
        query = query.filter(models.VideoSlot.date == date)
    query = query.order_by(models.VideoSlot.date.desc(), models.VideoSlot.id)
    return paginate(query, response, params.limit, params.offset).all()


@router.post("", response_model=schemas.VideoSlotOut, status_code=status.HTTP_201_CREATED)
def create_video_slot(
    body: schemas.VideoSlotCreate,
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("schedule.manage")),
    tenant_id: str = Depends(get_tenant_id),
):
    # Every foreign key on the body, checked against the caller's tenant.
    # Without this a row filed here can point at another hospital's records,
    # and the display helpers then resolve that id to a real name.
    assert_body_in_tenant(db, body, tenant_id)
    slot = models.VideoSlot(
        id=new_id("vs"),
        hospital_id=tenant_id,
        status="open",
        created_at=now_iso(),
        **body.model_dump(),
    )
    db.add(slot)
    db.commit()
    db.refresh(slot)
    return slot


def _get_slot(db: Session, slot_id: str, tenant_id: str) -> models.VideoSlot:
    slot = (
        scoped(db, models.VideoSlot, tenant_id)
        .filter(models.VideoSlot.id == slot_id)
        .first()
    )
    if slot is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Video slot not found")
    return slot


@router.post("/{slot_id}/book", response_model=schemas.VideoSlotOut)
def book_video_slot(
    slot_id: str,
    body: schemas.VideoSlotBook,
    db: Session = Depends(get_db),
    scope: str = Depends(require_permission("video_consults.join")),
    tenant_id: str = Depends(get_tenant_id),
):
    # Every foreign key on the body, checked against the caller's tenant.
    # Without this a row filed here can point at another hospital's records,
    # and the display helpers then resolve that id to a real name.
    assert_body_in_tenant(db, body, tenant_id)
    slot = _get_slot(db, slot_id, tenant_id)
    if slot.status == "booked":
        raise HTTPException(status.HTTP_409_CONFLICT, "Slot already booked")
    slot.status = "booked"
    slot.appointment_id = body.appointment_id

    # The consultation fee is invoiced here rather than by the client: a patient
    # books their own video consult but holds no permission to write payments,
    # and an invoice they could author themselves would be worth nothing anyway.
    appointment = (
        scoped(db, models.Appointment, tenant_id)
        .filter(models.Appointment.id == body.appointment_id)
        .first()
    )
    if appointment is not None:
        existing = (
            scoped(db, models.Payment, tenant_id)
            .filter(models.Payment.appointment_id == appointment.id)
            .first()
        )
        if existing is None:
            # The patient comes from the appointment, not the request: the
            # appointment already knows whose it is, so the invoice cannot be
            # addressed to someone else.
            doctor = (
                scoped(db, models.Doctor, tenant_id)
                .filter(models.Doctor.id == slot.doctor_id)
                .first()
            )
            db.add(
                models.Payment(
                    id=new_id("pay"),
                    hospital_id=tenant_id,
                    appointment_id=appointment.id,
                    patient_id=appointment.patient_id,
                    amount=doctor.consultation_fee if doctor else 0,
                    status="pending",
                    payment_method="Online",
                    created_at=now_iso(),
                )
            )

    db.commit()
    db.refresh(slot)
    return slot


@router.delete("/{slot_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_video_slot(
    slot_id: str,
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("schedule.manage")),
    tenant_id: str = Depends(get_tenant_id),
):
    slot = _get_slot(db, slot_id, tenant_id)
    db.delete(slot)
    db.commit()
