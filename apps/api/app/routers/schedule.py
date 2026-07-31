from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import get_current_user
from ..authz import require_permission
from ..database import get_db
from ..tenancy import get_tenant_id, scoped
from ..utils import new_id, now_iso

router = APIRouter(prefix="/schedule-blocks", tags=["schedule"])


@router.get("", response_model=list[schemas.ScheduleBlockOut])
def list_schedule_blocks(
    doctor_id: Optional[str] = Query(default=None, alias="doctorId"),
    db: Session = Depends(get_db),
    scope: str = Depends(require_permission("schedule.read")),
    tenant_id: str = Depends(get_tenant_id),
):
    query = scoped(db, models.ScheduleBlock, tenant_id)
    if doctor_id:
        query = query.filter(models.ScheduleBlock.doctor_id == doctor_id)
    return query.all()


@router.post(
    "", response_model=schemas.ScheduleBlockOut, status_code=status.HTTP_201_CREATED
)
def create_schedule_block(
    body: schemas.ScheduleBlockCreate,
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("schedule.manage")),
    tenant_id: str = Depends(get_tenant_id),
):
    block = models.ScheduleBlock(
        id=new_id("blk"),
        hospital_id=tenant_id,
        created_at=now_iso(),
        **body.model_dump(),
    )
    db.add(block)
    db.commit()
    db.refresh(block)
    return block


@router.delete("/{block_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_schedule_block(
    block_id: str,
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("schedule.manage")),
    tenant_id: str = Depends(get_tenant_id),
):
    block = (
        scoped(db, models.ScheduleBlock, tenant_id)
        .filter(models.ScheduleBlock.id == block_id)
        .first()
    )
    if block is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Schedule block not found")
    db.delete(block)
    db.commit()
