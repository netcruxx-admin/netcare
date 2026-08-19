from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import consent as consent_lib, models, schemas
from ..auth import get_current_user
from ..authz import (
    SCOPE_OWN,
    caller_doctor_id,
    caller_patient_id,
    own_record_filter,
    require_permission,
)
from ..database import get_db
from ..tenancy import assert_body_in_tenant, assert_in_tenant, get_tenant_id, scoped
from ..utils import (
    appointment_name_search,
    appointments_with_vitals,
    doctor_display,
    new_id,
    now_iso,
    paginate,
    patient_display,
)

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
        # Comma-separated, so a screen that means "anything but cancelled" can
        # say so instead of fetching everything and dropping rows client-side.
        wanted = [s.strip() for s in status_filter.split(",") if s.strip()]
        query = query.filter(models.Appointment.status.in_(wanted))
    if department_id:
        query = query.filter(models.Appointment.department_id == department_id)
    if date:
        query = query.filter(models.Appointment.date == date)
    # Matches the patient's name/phone or the doctor's name.
    query = appointment_name_search(query, q)
    # Newest first, then id to break ties — a stable order across pages.
    query = query.order_by(models.Appointment.date.desc(), models.Appointment.id)
    rows = paginate(query, response, limit, offset).all()

    # Resolve the display names in two queries for the whole page, so the client
    # never has to pull the full patient and doctor lists to render a table.
    patients = patient_display(db, (r.patient_id for r in rows), tenant_id)
    doctors = doctor_display(db, (r.doctor_id for r in rows), tenant_id)
    # The nurse's list shows whether vitals have been recorded; one query over
    # the page, rather than the client fetching every vitals row to find out.
    with_vitals = appointments_with_vitals(db, (r.id for r in rows))
    out = []
    for row in rows:
        item = schemas.AppointmentOut.model_validate(row)
        item.patient_name, item.patient_phone = patients.get(row.patient_id, ("", ""))
        item.doctor_name = doctors.get(row.doctor_id, "")
        item.has_vitals = row.id in with_vitals
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
    # The body names three rows by id. None of them has been checked against the
    # caller's tenant yet — scope "own" above only constrains *who* the caller
    # is, not which hospital the ids belong to — so a booking could otherwise be
    # filed here against another hospital's patient.
    assert_in_tenant(db, models.Patient, body.patient_id, tenant_id)
    assert_in_tenant(db, models.Doctor, body.doctor_id, tenant_id)
    assert_in_tenant(db, models.Department, body.department_id, tenant_id)

    appointment = models.Appointment(
        id=new_id("apt"),
        hospital_id=tenant_id,
        created_at=now_iso(),
        **body.model_dump(),
    )
    db.add(appointment)
    db.flush()

    if appointment.mode == "video":
        # Telemedicine Practice Guidelines 2020: a teleconsultation is consented
        # per consultation, not once at sign-up. A booking the patient made
        # themselves carries implied consent under the Guidelines, so it is
        # recorded here with that reason on the row; when staff or the doctor
        # books it, the patient has not been asked yet and the explicit consent
        # has to be captured before the call — POST /consents does that.
        own_patient = caller_patient_id(db, user)
        if own_patient is not None and appointment.patient_id == own_patient:
            purpose = db.get(models.ConsentPurpose, "telemedicine")
            if purpose is not None:
                consent_lib.record(
                    db,
                    tenant_id=tenant_id,
                    subject_user_id=user.id,
                    purpose=purpose,
                    method=consent_lib.METHOD_IMPLIED_PATIENT_INITIATED,
                    recorded_by_user_id=user.id,
                    appointment_id=appointment.id,
                )

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
    # Every foreign key on the body, checked against the caller's tenant.
    # Without this a row filed here can point at another hospital's records,
    # and the display helpers then resolve that id to a real name.
    assert_body_in_tenant(db, body, tenant_id)
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
