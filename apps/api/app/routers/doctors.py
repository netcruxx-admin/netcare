from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import get_current_user
from ..authz import (
    SCOPE_OWN,
    caller_doctor_id,
    own_record_filter,
    require_any_permission,
    require_permission,
)
from ..database import get_db
from ..tenancy import get_tenant_id, scoped
from ..utils import attach_users

router = APIRouter(prefix="/doctors", tags=["doctors"])


def _with_user(db: Session, doctor: models.Doctor) -> schemas.DoctorOut:
    out = schemas.DoctorOut.model_validate(doctor)
    user = db.get(models.User, doctor.user_id)
    if user:
        out.user = schemas.UserOut.model_validate(user)
    return out


@router.get("", response_model=list[schemas.DoctorOut])
def list_doctors(
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
    scope: str = Depends(require_permission("doctors.read")),
    tenant_id: str = Depends(get_tenant_id),
):
    query = scoped(db, models.Doctor, tenant_id)
    if scope == SCOPE_OWN:
        query = query.filter(models.Doctor.user_id == user.id)
    return attach_users(db, query.all(), schemas.DoctorOut, schemas.UserOut)


@router.get("/by-user/{user_id}", response_model=schemas.DoctorOut)
def get_doctor_by_user(
    user_id: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
    scope: str = Depends(require_permission("doctors.read")),
    tenant_id: str = Depends(get_tenant_id),
):
    if scope == SCOPE_OWN and user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Doctor not found"
        )
    doctor = (
        scoped(db, models.Doctor, tenant_id)
        .filter(models.Doctor.user_id == user_id)
        .first()
    )
    if doctor is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Doctor not found"
        )
    return _with_user(db, doctor)


@router.get("/{doctor_id}", response_model=schemas.DoctorOut)
def get_doctor(
    doctor_id: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
    scope: str = Depends(require_permission("doctors.read")),
    tenant_id: str = Depends(get_tenant_id),
):
    if scope == SCOPE_OWN and doctor_id != caller_doctor_id(db, user):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Doctor not found"
        )
    doctor = (
        scoped(db, models.Doctor, tenant_id)
        .filter(models.Doctor.id == doctor_id)
        .first()
    )
    if doctor is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Doctor not found"
        )
    return _with_user(db, doctor)


@router.get("/{doctor_id}/appointments", response_model=list[schemas.AppointmentOut])
def doctor_appointments(
    doctor_id: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
    scope: str = Depends(require_permission("appointments.read")),
    tenant_id: str = Depends(get_tenant_id),
):
    query = scoped(db, models.Appointment, tenant_id).filter(
        models.Appointment.doctor_id == doctor_id
    )
    if scope == SCOPE_OWN:
        query = query.filter(own_record_filter(db, user, models.Appointment))
    return query.all()


@router.put("/{doctor_id}", response_model=schemas.DoctorOut)
def update_doctor(
    doctor_id: str,
    body: schemas.DoctorUpdate,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
    held: dict = Depends(require_any_permission("doctors.manage", "profile.manage")),
    tenant_id: str = Depends(get_tenant_id),
):
    doctor = (
        scoped(db, models.Doctor, tenant_id)
        .filter(models.Doctor.id == doctor_id)
        .first()
    )
    if doctor is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Doctor not found")
    # Staff may edit any doctor; a doctor may edit only their own record.
    if "doctors.manage" not in held and doctor.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Doctor not found")

    fields = body.model_dump(exclude_unset=True)
    # Name/email/phone live on the user row, the rest on the doctor row.
    account = db.get(models.User, doctor.user_id)
    for field in ("name", "email", "phone"):
        if field in fields and account is not None:
            setattr(account, field, fields.pop(field))
    for field, value in fields.items():
        setattr(doctor, field, value)
    db.commit()
    db.refresh(doctor)
    return _with_user(db, doctor)


@router.delete("/{doctor_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_doctor(
    doctor_id: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
    _: dict = Depends(require_permission("doctors.manage")),
    tenant_id: str = Depends(get_tenant_id),
):
    doctor = (
        scoped(db, models.Doctor, tenant_id)
        .filter(models.Doctor.id == doctor_id)
        .first()
    )
    if doctor is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Doctor not found")
    linked_user = db.get(models.User, doctor.user_id)
    db.delete(doctor)
    if linked_user:
        db.delete(linked_user)
    db.commit()


@router.get("/{doctor_id}/availability", response_model=schemas.DoctorAvailabilityOut)
def doctor_availability(
    doctor_id: str,
    date: str,
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("appointments.create")),
    tenant_id: str = Depends(get_tenant_id),
):
    """Which times a doctor is unavailable on a date.

    Booking a slot requires knowing what everyone else has taken, but a patient
    may not read other people's appointments. So the server answers the question
    — times only, no patient, no reason, no ids — instead of handing over the
    rows the client would otherwise have to filter itself.
    """
    taken = [
        row.time
        for row in scoped(db, models.Appointment, tenant_id)
        .filter(
            models.Appointment.doctor_id == doctor_id,
            models.Appointment.date == date,
            models.Appointment.status == "scheduled",
        )
        .all()
    ]
    blocks = (
        scoped(db, models.ScheduleBlock, tenant_id)
        .filter(
            models.ScheduleBlock.doctor_id == doctor_id,
            models.ScheduleBlock.date == date,
        )
        .all()
    )
    return schemas.DoctorAvailabilityOut(
        doctor_id=doctor_id,
        date=date,
        taken=sorted(set(taken)),
        blocks=[schemas.ScheduleBlockOut.model_validate(b) for b in blocks],
    )
