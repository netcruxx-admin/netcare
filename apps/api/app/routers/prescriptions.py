from typing import Optional

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import get_current_user
from ..database import get_db
from ..utils import new_id, now_iso

router = APIRouter(prefix="/prescriptions", tags=["prescriptions"])


@router.get("", response_model=list[schemas.PrescriptionOut])
def list_prescriptions(
    patient_id: Optional[str] = None,
    appointment_id: Optional[str] = None,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    query = db.query(models.Prescription)
    if patient_id:
        query = query.filter(models.Prescription.patient_id == patient_id)
    if appointment_id:
        query = query.filter(models.Prescription.appointment_id == appointment_id)
    return query.all()


@router.post(
    "", response_model=schemas.PrescriptionOut, status_code=status.HTTP_201_CREATED
)
def create_prescription(
    body: schemas.PrescriptionCreate,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    prescription = models.Prescription(
        id=new_id("presc"), created_at=now_iso(), **body.model_dump()
    )
    db.add(prescription)
    db.commit()
    db.refresh(prescription)
    return prescription
