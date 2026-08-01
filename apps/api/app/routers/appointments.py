from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import get_current_user
from ..authz import (
    SCOPE_OWN,
    caller_doctor_id,
    caller_patient_id,
    own_record_filter,
    require_permission,
)
from ..database import get_db
from ..tenancy import get_tenant_id, scoped
from ..utils import new_id, now_iso

router = APIRouter(prefix="/appointments", tags=["appointments"])


@router.get("", response_model=list[schemas.AppointmentOut])
def list_appointments(
    patient_id: Optional[str] = Query(default=None, alias="patientId"),
    doctor_id: Optional[str] = Query(default=None, alias="doctorId"),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
    scope: str = Depends(require_permission("appointments.read")),
    tenant_id: str = Depends(get_tenant_id),
):
    query = scoped(db, models.Appointment, tenant_id)
    if patient_id:
        query = query.filter(models.Appointment.patient_id == patient_id)
    if doctor_id:
        query = query.filter(models.Appointment.doctor_id == doctor_id)
    # With scope "own" the caller sees only appointments they are a party to,
    # whatever ids they passed above.
    if scope == SCOPE_OWN:
        query = query.filter(own_record_filter(db, user, models.Appointment))
    return query.all()


@router.post("", response_model=schemas.AppointmentOut, status_code=status.HTTP_201_CREATED)
def create_appointment(
    body: schemas.AppointmentCreate,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
    scope: str = Depends(require_permission("appointments.create")),
    tenant_id: str = Depends(get_tenant_id),
):
    # With scope "own" the caller must be a party to the appointment they are
    # creating: a patient books only for themselves, a doctor books only into
    # their own diary (the follow-up flow). Staff holding "all" book for anyone.
    if scope == SCOPE_OWN:
        own_patient = caller_patient_id(db, user)
        own_doctor = caller_doctor_id(db, user)
        is_own_booking = (
            (own_patient is not None and body.patient_id == own_patient)
            or (own_doctor is not None and body.doctor_id == own_doctor)
        )
        if not is_own_booking:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only book appointments you are part of",
            )
    appointment = models.Appointment(
        id=new_id("apt"),
        hospital_id=tenant_id,
        created_at=now_iso(),
        **body.model_dump(),
    )
    db.add(appointment)
    db.commit()
    db.refresh(appointment)
    return appointment


@router.get("/{appointment_id}", response_model=schemas.AppointmentOut)
def get_appointment(
    appointment_id: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
    scope: str = Depends(require_permission("appointments.read")),
    tenant_id: str = Depends(get_tenant_id),
):
    query = scoped(db, models.Appointment, tenant_id).filter(
        models.Appointment.id == appointment_id
    )
    if scope == SCOPE_OWN:
        query = query.filter(own_record_filter(db, user, models.Appointment))
    appointment = query.first()
    if appointment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Appointment not found"
        )
    return appointment


@router.put("/{appointment_id}", response_model=schemas.AppointmentOut)
def update_appointment(
    appointment_id: str,
    body: schemas.AppointmentUpdate,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
    scope: str = Depends(require_permission("appointments.manage")),
    tenant_id: str = Depends(get_tenant_id),
):
    query = scoped(db, models.Appointment, tenant_id).filter(
        models.Appointment.id == appointment_id
    )
    if scope == SCOPE_OWN:
        query = query.filter(own_record_filter(db, user, models.Appointment))
    appointment = query.first()
    if appointment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Appointment not found"
        )
    changes = body.model_dump(exclude_unset=True)

    # Handing an appointment to a different doctor hands that doctor the
    # patient's chart, so it takes hospital-wide authority. A caller scoped to
    # their own appointments may edit them but not move them to someone else.
    reassignment = {k: v for k, v in changes.items() if k in ("doctor_id", "department_id")}
    if reassignment and scope == SCOPE_OWN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You cannot reassign an appointment to another doctor",
        )

    moved = (
        changes.get("date", appointment.date) != appointment.date
        or changes.get("time", appointment.time) != appointment.time
    )

    for field, value in changes.items():
        setattr(appointment, field, value)
    if moved:
        appointment.rescheduled = True
    db.commit()
    db.refresh(appointment)
    return appointment


@router.delete("/{appointment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_appointment(
    appointment_id: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
    scope: str = Depends(require_permission("appointments.manage")),
    tenant_id: str = Depends(get_tenant_id),
):
    query = scoped(db, models.Appointment, tenant_id).filter(
        models.Appointment.id == appointment_id
    )
    if scope == SCOPE_OWN:
        query = query.filter(own_record_filter(db, user, models.Appointment))
    appointment = query.first()
    if appointment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Appointment not found"
        )
    db.delete(appointment)
    db.commit()
