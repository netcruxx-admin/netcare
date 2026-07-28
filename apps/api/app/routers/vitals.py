from typing import Optional

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import get_current_user
from ..database import get_db
from ..utils import new_id, now_iso

router = APIRouter(prefix="/vitals", tags=["vitals"])


@router.get("", response_model=list[schemas.VitalsOut])
def list_vitals(
    patient_id: Optional[str] = None,
    appointment_id: Optional[str] = None,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    query = db.query(models.Vitals)
    if patient_id:
        query = query.filter(models.Vitals.patient_id == patient_id)
    if appointment_id:
        query = query.filter(models.Vitals.appointment_id == appointment_id)
    return query.all()


@router.post("", response_model=schemas.VitalsOut, status_code=status.HTTP_201_CREATED)
def create_vitals(
    body: schemas.VitalsCreate,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    vitals = models.Vitals(id=new_id("vit"), created_at=now_iso(), **body.model_dump())
    db.add(vitals)
    db.commit()
    db.refresh(vitals)
    return vitals
