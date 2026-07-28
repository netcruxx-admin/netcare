from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import get_current_user
from ..database import get_db

router = APIRouter(prefix="/doctors", tags=["doctors"])


@router.get("", response_model=list[schemas.DoctorOut])
def list_doctors(db: Session = Depends(get_db)):
    return db.query(models.Doctor).all()


@router.get("/by-user/{user_id}", response_model=schemas.DoctorOut)
def get_doctor_by_user(
    user_id: str,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    doctor = db.query(models.Doctor).filter(models.Doctor.user_id == user_id).first()
    if doctor is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Doctor not found"
        )
    return doctor


@router.get("/{doctor_id}", response_model=schemas.DoctorOut)
def get_doctor(doctor_id: str, db: Session = Depends(get_db)):
    doctor = db.get(models.Doctor, doctor_id)
    if doctor is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Doctor not found"
        )
    return doctor


@router.get("/{doctor_id}/appointments", response_model=list[schemas.AppointmentOut])
def doctor_appointments(
    doctor_id: str,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    return (
        db.query(models.Appointment)
        .filter(models.Appointment.doctor_id == doctor_id)
        .all()
    )
