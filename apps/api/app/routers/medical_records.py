from typing import Optional

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import get_current_user
from ..database import get_db
from ..utils import new_id, now_iso

router = APIRouter(prefix="/medical-records", tags=["medical-records"])


@router.get("", response_model=list[schemas.MedicalRecordOut])
def list_medical_records(
    patient_id: Optional[str] = None,
    appointment_id: Optional[str] = None,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    query = db.query(models.MedicalRecord)
    if patient_id:
        query = query.filter(models.MedicalRecord.patient_id == patient_id)
    if appointment_id:
        query = query.filter(models.MedicalRecord.appointment_id == appointment_id)
    return query.all()


@router.post(
    "", response_model=schemas.MedicalRecordOut, status_code=status.HTTP_201_CREATED
)
def create_medical_record(
    body: schemas.MedicalRecordCreate,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    record = models.MedicalRecord(
        id=new_id("med"), created_at=now_iso(), **body.model_dump()
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record
