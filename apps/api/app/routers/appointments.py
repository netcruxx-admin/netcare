import re
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import consent as consent_lib, models, notify, pricing, schemas
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
    DEFAULT_APPOINTMENT_SORT,
    apply_appointment_sort,
    appointment_name_search,
    appointment_bills,
    appointments_with_vitals,
    assert_no_duplicate_department_booking,
    doctor_display,
    new_id,
    now_iso,
    paginate,
    patient_display,
)

router = APIRouter(prefix="/appointments", tags=["appointments"])


def _slot_minutes(value: str) -> Optional[int]:
    """Parse a time-of-day string to minutes since midnight.

    Appointment times arrive as 12-hour slot labels ("09:00 AM"); the
    hospital's booking-window bounds are admin-entered 24-hour "HH:MM"
    strings. Both shapes are accepted here so the two can be compared.
    Returns None if `value` matches neither shape.
    """
    value = value.strip()
    ampm = re.match(r"^(\d{1,2}):(\d{2})\s*(AM|PM)$", value, re.IGNORECASE)
    if ampm:
        hour, minute, meridiem = int(ampm.group(1)), int(ampm.group(2)), ampm.group(3).upper()
        if not (1 <= hour <= 12 and 0 <= minute < 60):
            return None
        if meridiem == "PM" and hour != 12:
            hour += 12
        if meridiem == "AM" and hour == 12:
            hour = 0
        return hour * 60 + minute
    military = re.match(r"^(\d{1,2}):(\d{2})$", value)
    if military:
        hour, minute = int(military.group(1)), int(military.group(2))
        if not (0 <= hour <= 23 and 0 <= minute < 60):
            return None
        return hour * 60 + minute
    return None


@router.get("", response_model=list[schemas.AppointmentOut])
def list_appointments(
    response: Response,
    patient_id: Optional[str] = Query(default=None, alias="patientId"),
    doctor_id: Optional[str] = Query(default=None, alias="doctorId"),
    q: Optional[str] = Query(default=None),
    status_filter: Optional[str] = Query(default=None, alias="status"),
    department_id: Optional[str] = Query(default=None, alias="departmentId"),
    date: Optional[str] = Query(default=None),
    date_from: Optional[str] = Query(default=None, alias="dateFrom"),
    date_to: Optional[str] = Query(default=None, alias="dateTo"),
    sort: str = Query(default=DEFAULT_APPOINTMENT_SORT),
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
    # Additive range filter, independent of `date` above: a caller that wants
    # a single day still sends just `date`, one exact match either way.
    if date_from:
        query = query.filter(models.Appointment.date >= date_from)
    if date_to:
        query = query.filter(models.Appointment.date <= date_to)
    # Matches the patient's name/phone or the doctor's name.
    query = appointment_name_search(query, q)
    # Newest first by default; `sort` overrides. Always tie-broken by id for a
    # stable order across pages.
    query = apply_appointment_sort(query, sort)
    rows = paginate(query, response, limit, offset).all()

    # Resolve the display names in two queries for the whole page, so the client
    # never has to pull the full patient and doctor lists to render a table.
    patients = patient_display(db, (r.patient_id for r in rows), tenant_id)
    doctors = doctor_display(db, (r.doctor_id for r in rows), tenant_id)
    # The nurse's list shows whether vitals have been recorded; one query over
    # the page, rather than the client fetching every vitals row to find out.
    with_vitals = appointments_with_vitals(db, (r.id for r in rows))
    # Paid or not, on the appointment itself: the desk works the list, not the
    # ledger, and chasing an unpaid visit should not need a second screen.
    bills = appointment_bills(db, (r.id for r in rows), tenant_id)
    out = []
    for row in rows:
        item = schemas.AppointmentOut.model_validate(row)
        item.patient_name, item.patient_phone = patients.get(row.patient_id, ("", ""))
        item.doctor_name = doctors.get(row.doctor_id, "")
        item.has_vitals = row.id in with_vitals
        bill = bills.get(row.id)
        if bill is not None:
            item.payment_id = bill.payment_id
            item.payment_status = bill.status
            item.payment_amount = bill.amount
            item.payment_method = bill.payment_method
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
        patient_self_booking = own_patient is not None and body.patient_id == own_patient
        is_own_booking = (
            patient_self_booking
            or (own_doctor is not None and body.doctor_id == own_doctor)
        )
        if not is_own_booking:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only book appointments you are part of",
            )
        # A patient booking themselves online is limited to the hospital's
        # configured booking hours, if any are set. Receptionist/admin
        # bookings (scope "all") and a doctor's own follow-up booking are
        # never restricted by this.
        if patient_self_booking:
            profile = (
                db.query(models.HospitalProfile)
                .filter(models.HospitalProfile.hospital_id == tenant_id)
                .first()
            )
            window_start = profile.patient_booking_window_start if profile else None
            window_end = profile.patient_booking_window_end if profile else None
            if window_start and window_end:
                start_min = _slot_minutes(window_start)
                end_min = _slot_minutes(window_end)
                time_min = _slot_minutes(body.time)
                if time_min is None or start_min is None or end_min is None or not (
                    start_min <= time_min < end_min
                ):
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="This time is outside the hospital's online booking hours",
                    )
    # The body names three rows by id. None of them has been checked against the
    # caller's tenant yet — scope "own" above only constrains *who* the caller
    # is, not which hospital the ids belong to — so a booking could otherwise be
    # filed here against another hospital's patient.
    assert_in_tenant(db, models.Patient, body.patient_id, tenant_id)
    assert_in_tenant(db, models.Doctor, body.doctor_id, tenant_id)
    assert_in_tenant(db, models.Department, body.department_id, tenant_id)

    assert_no_duplicate_department_booking(
        db, tenant_id, body.patient_id, body.department_id, body.date
    )

    # `payment_mode` is how this booking is being paid for, not a column on the
    # appointment: the answer lives on the payment row it raises below.
    fields = body.model_dump()
    payment_mode = fields.pop("payment_mode", None)

    appointment = models.Appointment(
        id=new_id("apt"),
        hospital_id=tenant_id,
        created_at=now_iso(),
        **fields,
    )
    db.add(appointment)
    db.flush()

    # Booking and billing land in one transaction, so a booking paid at the
    # desk can never exist without the bill that goes with it.
    pricing.bill_at_counter(
        db, tenant_id=tenant_id, appointment=appointment, payment_mode=payment_mode
    )

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

    # Whoever placed the booking already knows — only the other party learns
    # something from a push. A patient booking their own visit doesn't need
    # telling; a doctor booking a follow-up for their own patient doesn't
    # either. Staff booking on behalf of someone else are neither party, so
    # both sides still hear about it.
    acting_patient_id = caller_patient_id(db, user)
    acting_doctor_id = caller_doctor_id(db, user)

    doc_name = doctor_display(db, [appointment.doctor_id], tenant_id).get(appointment.doctor_id, "")
    pat_name = patient_display(db, [appointment.patient_id], tenant_id).get(appointment.patient_id, ("", ""))[0]
    if appointment.patient_id != acting_patient_id:
        notify.notify_patient(
            db, tenant_id, appointment.patient_id,
            title="Appointment booked",
            body=(
                f"Your appointment with Dr. {doc_name} on {appointment.date} at {appointment.time} is confirmed."
                if doc_name else
                f"Your appointment on {appointment.date} at {appointment.time} is confirmed."
            ),
            data={"type": "appointment", "appointmentId": appointment.id, "url": "/dashboard/appointments"},
        )
    if appointment.doctor_id != acting_doctor_id:
        notify.notify_doctor(
            db, tenant_id, appointment.doctor_id,
            title="New appointment",
            body=(
                f"{pat_name} booked an appointment on {appointment.date} at {appointment.time}."
                if pat_name else
                f"New appointment booked on {appointment.date} at {appointment.time}."
            ),
            data={"type": "appointment", "appointmentId": appointment.id, "url": "/dashboard/appointments"},
        )
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
    # The detail view answers the same "is this paid" question the list does,
    # so a screen does not change its mind about a visit when you open it.
    item = schemas.AppointmentOut.model_validate(appointment)
    bill = appointment_bills(db, [appointment.id], tenant_id).get(appointment.id)
    if bill is not None:
        item.payment_id = bill.payment_id
        item.payment_status = bill.status
        item.payment_amount = bill.amount
        item.payment_method = bill.payment_method
    return item


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
    was_cancelled = appointment.status == "cancelled"

    # Same rule as booking, checked again here: a reschedule or an uncancel is
    # a second way to land two live appointments in one department on one day,
    # not just a fresh create. Only worth the query when one of the three
    # things the rule actually depends on is what's changing.
    final_status = changes.get("status", appointment.status)
    rule_relevant = (
        "department_id" in changes
        or "date" in changes
        or (was_cancelled and final_status != "cancelled")
    )
    if rule_relevant and final_status != "cancelled":
        assert_no_duplicate_department_booking(
            db,
            tenant_id,
            appointment.patient_id,
            changes.get("department_id", appointment.department_id),
            changes.get("date", appointment.date),
            exclude_appointment_id=appointment.id,
        )

    for field, value in changes.items():
        setattr(appointment, field, value)
    if moved:
        appointment.rescheduled = True
    db.commit()
    db.refresh(appointment)

    newly_cancelled = appointment.status == "cancelled" and not was_cancelled
    if moved or newly_cancelled:
        doc_name = doctor_display(db, [appointment.doctor_id], tenant_id).get(appointment.doctor_id, "")
        pat_name = patient_display(db, [appointment.patient_id], tenant_id).get(appointment.patient_id, ("", ""))[0]
        if newly_cancelled:
            title = "Appointment cancelled"
            patient_body = (
                f"Your appointment with Dr. {doc_name} on {appointment.date} at {appointment.time} was cancelled."
                if doc_name else
                f"Your appointment on {appointment.date} at {appointment.time} was cancelled."
            )
            doctor_body = (
                f"{pat_name}'s appointment on {appointment.date} at {appointment.time} was cancelled."
                if pat_name else
                f"An appointment on {appointment.date} at {appointment.time} was cancelled."
            )
        else:
            title = "Appointment rescheduled"
            patient_body = (
                f"Your appointment with Dr. {doc_name} was moved to {appointment.date} at {appointment.time}."
                if doc_name else
                f"Your appointment was moved to {appointment.date} at {appointment.time}."
            )
            doctor_body = (
                f"{pat_name}'s appointment was moved to {appointment.date} at {appointment.time}."
                if pat_name else
                f"An appointment was moved to {appointment.date} at {appointment.time}."
            )
        # The party who made this change already knows; only tell the other
        # one. Staff acting on behalf of either party are neither, so both
        # still hear about it.
        acting_patient_id = caller_patient_id(db, user)
        acting_doctor_id = caller_doctor_id(db, user)
        if appointment.patient_id != acting_patient_id:
            notify.notify_patient(
                db, tenant_id, appointment.patient_id,
                title=title, body=patient_body,
                data={"type": "appointment", "appointmentId": appointment.id, "url": "/dashboard/appointments"},
            )
        if appointment.doctor_id != acting_doctor_id:
            notify.notify_doctor(
                db, tenant_id, appointment.doctor_id,
                title=title, body=doctor_body,
                data={"type": "appointment", "appointmentId": appointment.id, "url": "/dashboard/appointments"},
            )
    return appointment


@router.delete("/{appointment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_appointment(
    appointment_id: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
    scope: str = Depends(require_permission("appointments.delete")),
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
