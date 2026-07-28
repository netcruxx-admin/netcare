from typing import Optional

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import get_current_user
from ..database import get_db
from ..tenancy import get_tenant_id, scoped
from ..utils import new_id, now_iso

router = APIRouter(prefix="/prescriptions", tags=["prescriptions"])


@router.get("", response_model=list[schemas.PrescriptionOut])
def list_prescriptions(
    patient_id: Optional[str] = None,
    appointment_id: Optional[str] = None,
    doctor_id: Optional[str] = None,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
    tenant_id: str = Depends(get_tenant_id),
):
    query = scoped(db, models.Prescription, tenant_id)
    if patient_id:
        query = query.filter(models.Prescription.patient_id == patient_id)
    if appointment_id:
        query = query.filter(models.Prescription.appointment_id == appointment_id)
    if doctor_id:
        query = query.filter(models.Prescription.doctor_id == doctor_id)
    return query.all()


@router.post(
    "", response_model=schemas.PrescriptionOut, status_code=status.HTTP_201_CREATED
)
def create_prescription(
    body: schemas.PrescriptionCreate,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
    tenant_id: str = Depends(get_tenant_id),
):
    prescription = models.Prescription(
        id=new_id("presc"),
        hospital_id=tenant_id,
        created_at=now_iso(),
        **body.model_dump(),
    )
    db.add(prescription)
    db.commit()
    db.refresh(prescription)
    return prescription
