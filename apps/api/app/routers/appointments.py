from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, aliased

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
from ..utils import new_id, now_iso, doctor_display, paginate, patient_display

router = APIRouter(prefix="/appointments", tags=["appointments"])


@router.get("", response_model=list[schemas.AppointmentOut])
def list_appointments(
    response: Response,
    patient_id: Optional[str] = Query(default=None, alias="patientId"),
    doctor_id: Optional[str] = Query(default=None, alias="doctorId"),
    q: Optional[str] = Query(default=None),
    status_filter: Optional[str] = Query(default=None, alias="status"),
    department_id: Optional[str] = Query(default=None, alias="departmentId"),
    date: Optional[str] = Query(default=None),
    limit: Optional[int] = Query(default=None, ge=1),
    offset: int = Query(default=0, ge=0),
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
    if status_filter:
        query = query.filter(models.Appointment.status == status_filter)
    if department_id:
        query = query.filter(models.Appointment.department_id == department_id)
    if date:
        query = query.filter(models.Appointment.date == date)
    if q:
        # Matches the patient's name/phone or the doctor's name. Outer joins so
        # an appointment whose patient or doctor row is missing still appears
        # rather than silently vanishing from the list.
        like = f"%{q.strip().lower()}%"
        pat_user = aliased(models.User)
        doc_user = aliased(models.User)
        query = (
            query.outerjoin(
                models.Patient, models.Patient.id == models.Appointment.patient_id
            )
            .outerjoin(pat_user, pat_user.id == models.Patient.user_id)
            .outerjoin(models.Doctor, models.Doctor.id == models.Appointment.doctor_id)
            .outerjoin(doc_user, doc_user.id == models.Doctor.user_id)
            .filter(
                or_(
                    func.lower(pat_user.name).like(like),
                    func.lower(pat_user.phone).like(like),
                    func.lower(models.Patient.phone).like(like),
                    func.lower(doc_user.name).like(like),
                )
            )
        )
    # Newest first, then id to break ties — a stable order across pages.
    query = query.order_by(models.Appointment.date.desc(), models.Appointment.id)
    rows = paginate(query, response, limit, offset).all()

    # Resolve the display names in two queries for the whole page, so the client
    # never has to pull the full patient and doctor lists to render a table.
    patients = patient_display(db, (r.patient_id for r in rows))
    doctors = doctor_display(db, (r.doctor_id for r in rows))
    out = []
    for row in rows:
        item = schemas.AppointmentOut.model_validate(row)
        item.patient_name, item.patient_phone = patients.get(row.patient_id, ("", ""))
        item.doctor_name = doctors.get(row.doctor_id, "")
        out.append(item)
    return out


@router.get("/stats", response_model=schemas.AppointmentStatsOut)
def appointment_stats(
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
    scope: str = Depends(require_permission("appointments.read")),
    tenant_id: str = Depends(get_tenant_id),
):
    """Counts by status for the whole (scoped) set.

    The summary tiles above a paginated table describe *everything* the caller
    can see, not the fifty rows currently on screen, so they cannot be derived
    client-side once the list is paged. One GROUP BY instead of downloading
    every appointment to count them.
    """
    base = scoped(db, models.Appointment, tenant_id)
    if scope == SCOPE_OWN:
        base = base.filter(own_record_filter(db, user, models.Appointment))
    by_status = dict(
        base.with_entities(models.Appointment.status, func.count())
        .group_by(models.Appointment.status)
        .all()
    )
    rescheduled = base.filter(models.Appointment.rescheduled.is_(True)).count()
    return schemas.AppointmentStatsOut(
        total=sum(by_status.values()),
        scheduled=by_status.get("scheduled", 0),
        completed=by_status.get("completed", 0),
        cancelled=by_status.get("cancelled", 0),
        rescheduled=rescheduled,
    )


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
