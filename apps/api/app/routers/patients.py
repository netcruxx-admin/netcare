from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import get_current_user
from ..database import get_db

router = APIRouter(prefix="/patients", tags=["patients"])


def _get_or_404(db: Session, patient_id: str) -> models.Patient:
    patient = db.get(models.Patient, patient_id)
    if patient is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found"
        )
    return patient


@router.get("/by-user/{user_id}", response_model=schemas.PatientOut)
def get_patient_by_user(
    user_id: str,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    patient = (
        db.query(models.Patient).filter(models.Patient.user_id == user_id).first()
    )
    if patient is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found"
        )
    return patient


@router.get("/{patient_id}", response_model=schemas.PatientOut)
def get_patient(
    patient_id: str,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    return _get_or_404(db, patient_id)


@router.put("/{patient_id}", response_model=schemas.PatientOut)
def update_patient(
    patient_id: str,
    body: schemas.PatientUpdate,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    patient = _get_or_404(db, patient_id)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(patient, field, value)
    db.commit()
    db.refresh(patient)
    return patient


@router.get("/{patient_id}/appointments", response_model=list[schemas.AppointmentOut])
def patient_appointments(
    patient_id: str,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    return (
        db.query(models.Appointment)
        .filter(models.Appointment.patient_id == patient_id)
        .all()
    )


@router.get(
    "/{patient_id}/medical-records", response_model=list[schemas.MedicalRecordOut]
)
def patient_medical_records(
    patient_id: str,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    return (
        db.query(models.MedicalRecord)
        .filter(models.MedicalRecord.patient_id == patient_id)
        .all()
    )


@router.get("/{patient_id}/payments", response_model=list[schemas.PaymentOut])
def patient_payments(
    patient_id: str,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    return (
        db.query(models.Payment)
        .filter(models.Payment.patient_id == patient_id)
        .all()
    )


@router.get(
    "/{patient_id}/prescriptions", response_model=list[schemas.PrescriptionOut]
)
def patient_prescriptions(
    patient_id: str,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    return (
        db.query(models.Prescription)
        .filter(models.Prescription.patient_id == patient_id)
        .all()
    )


@router.get("/{patient_id}/vitals", response_model=list[schemas.VitalsOut])
def patient_vitals(
    patient_id: str,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    return (
        db.query(models.Vitals)
        .filter(models.Vitals.patient_id == patient_id)
        .all()
    )
