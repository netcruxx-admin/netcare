from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.exc import IntegrityError
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
from ..utils import ListQuery, attach_users, list_params, paginate, text_search

router = APIRouter(prefix="/doctors", tags=["doctors"])


def _with_user(db: Session, doctor: models.Doctor) -> schemas.DoctorOut:
    out = schemas.DoctorOut.model_validate(doctor)
    user = db.get(models.User, doctor.user_id)
    if user:
        out.user = schemas.UserOut.model_validate(user)
    return out


@router.get("", response_model=list[schemas.DoctorOut])
def list_doctors(
    response: Response,
    department_id: Optional[str] = Query(default=None, alias="departmentId"),
    specialization: Optional[str] = Query(default=None),
    verification_status: Optional[str] = Query(default=None, alias="verificationStatus"),
    params: ListQuery = Depends(list_params),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
    scope: str = Depends(require_permission("doctors.read")),
    tenant_id: str = Depends(get_tenant_id),
):
    query = scoped(db, models.Doctor, tenant_id)
    if scope == SCOPE_OWN:
        query = query.filter(models.Doctor.user_id == user.id)
    if department_id:
        query = query.filter(models.Doctor.department_id == department_id)
    if specialization:
        query = query.filter(models.Doctor.specialization == specialization)
    if verification_status:
        query = query.filter(models.Doctor.verification_status == verification_status)
    if params.q:
        # A doctor's name and email live on the linked user row, so the search
        # has to reach through the join rather than only the doctor record.
        query = query.outerjoin(models.User, models.User.id == models.Doctor.user_id)
        query = text_search(
            query,
            [
                models.User.name,
                models.User.email,
                models.Doctor.specialization,
                models.Doctor.qualification,
                models.Doctor.license_number,
            ],
            params.q,
        )
    query = query.order_by(models.Doctor.id)
    query = paginate(query, response, params.limit, params.offset)
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
    response: Response,
    params: ListQuery = Depends(list_params),
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
    query = query.order_by(models.Appointment.date.desc(), models.Appointment.id)
    return paginate(query, response, params.limit, params.offset).all()


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

    # Check email uniqueness before writing so the error is a 409, not a 500.
    new_email = fields.get("email")
    if new_email and account and new_email != account.email:
        clash = (
            db.query(models.User)
            .filter(
                models.User.hospital_id == tenant_id,
                models.User.email == new_email,
                models.User.id != account.id,
            )
            .first()
        )
        if clash:
            raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")

    for field in ("name", "email", "phone"):
        if field in fields and account is not None:
            setattr(account, field, fields.pop(field))
    for field, value in fields.items():
        setattr(doctor, field, value)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already in use at this hospital.",
        )
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
