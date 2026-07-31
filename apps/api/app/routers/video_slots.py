from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import get_current_user
from ..authz import require_permission
from ..database import get_db
from ..tenancy import get_tenant_id, scoped
from ..utils import new_id, now_iso

router = APIRouter(prefix="/video-slots", tags=["video-slots"])


@router.get("", response_model=list[schemas.VideoSlotOut])
def list_video_slots(
    doctor_id: Optional[str] = Query(default=None, alias="doctorId"),
    slot_status: Optional[schemas.VideoSlotStatus] = None,
    db: Session = Depends(get_db),
    scope: str = Depends(require_permission("video_consults.join")),
    tenant_id: str = Depends(get_tenant_id),
):
    query = scoped(db, models.VideoSlot, tenant_id)
    if doctor_id:
        query = query.filter(models.VideoSlot.doctor_id == doctor_id)
    if slot_status:
        query = query.filter(models.VideoSlot.status == slot_status)
    return query.all()


@router.post("", response_model=schemas.VideoSlotOut, status_code=status.HTTP_201_CREATED)
def create_video_slot(
    body: schemas.VideoSlotCreate,
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("schedule.manage")),
    tenant_id: str = Depends(get_tenant_id),
):
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
    slot = _get_slot(db, slot_id, tenant_id)
    if slot.status == "booked":
        raise HTTPException(status.HTTP_409_CONFLICT, "Slot already booked")
    slot.status = "booked"
    slot.appointment_id = body.appointment_id
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
