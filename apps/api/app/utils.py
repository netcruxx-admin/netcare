from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Iterable, Optional, Sequence, TypeVar
from uuid import uuid4

from fastapi import HTTPException, Query, Response, status
from sqlalchemy import Integer, case, cast, func, or_
from sqlalchemy.orm import Session, aliased

from . import models

T = TypeVar("T")


def new_id(prefix: str) -> str:
    return f"{prefix}-{uuid4().hex[:8]}"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


#: Largest page a client may ask for. A caller passing limit=100000 should not
#: be able to undo pagination.
MAX_PAGE_SIZE = 200


@dataclass
class ListQuery:
    """The three arguments every collection endpoint accepts."""

    q: Optional[str] = None
    limit: Optional[int] = None
    offset: int = 0


def list_params(
    q: Optional[str] = Query(default=None, description="Free-text search"),
    limit: Optional[int] = Query(default=None, ge=1, description="Page size; omit for all"),
    offset: int = Query(default=0, ge=0),
) -> ListQuery:
    """Dependency giving every list endpoint the same three query params.

    Declared once so `q`, `limit` and `offset` cannot drift in name, validation
    or default between endpoints — a client that learned the convention on one
    collection can use it on any of them.
    """
    return ListQuery(q=q, limit=limit, offset=offset)


def text_search(query, columns: Sequence, q: Optional[str]):
    """Narrow `query` to rows where any of `columns` contains `q`.

    Case-insensitive substring match. Returns the query untouched when `q` is
    empty, so "no search" is never confused with "search for nothing".
    """
    if not q or not q.strip():
        return query
    like = f"%{q.strip().lower()}%"
    return query.filter(or_(*[func.lower(col).like(like) for col in columns]))


def paginate(query, response: Response, limit: Optional[int], offset: int):
    """Apply limit/offset and report the unpaginated total in X-Total-Count.

    `limit=None` means "everything", which is the default: several screens use
    these lists as lookup tables (resolving a patient id to a name), and quietly
    returning the first 50 would drop names from the UI rather than page them.
    Pagination is therefore opt-in per caller — the screens that render a long
    table pass a limit, the ones building a map do not.

    The total is always reported, so a client can decide to start paging.
    """
    total = query.order_by(None).count()
    response.headers["X-Total-Count"] = str(total)
    if limit is not None:
        query = query.limit(min(limit, MAX_PAGE_SIZE))
    if offset:
        query = query.offset(offset)
    return query


def assert_aadhaar_unused(
    db: Session,
    tenant_id: str,
    aadhaar_number: Optional[str],
    *,
    exclude_patient_id: Optional[str] = None,
) -> None:
    """Refuse a second record for a person this hospital already has.

    Catching the duplicate here rather than letting the unique index raise is
    the difference between "Anita Desai is already registered" and a 500. The
    number is the only field on the record that can answer "is this the same
    person", which is the whole reason it is collected.

    Scoped to the tenant: the same patient at two hospitals is two records, and
    neither may learn about the other.
    """
    if not aadhaar_number:
        return
    query = (
        db.query(models.Patient)
        .filter(models.Patient.hospital_id == tenant_id)
        .filter(models.Patient.aadhaar_number == aadhaar_number)
    )
    if exclude_patient_id:
        query = query.filter(models.Patient.id != exclude_patient_id)
    if query.first() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A patient with this Aadhaar number is already registered here.",
        )


def users_by_id(db: Session, user_ids: Iterable[str]) -> dict[str, models.User]:
    """The users behind a set of rows, in one query.

    Patient and Doctor both carry a user_id whose name/email the client needs,
    which invites `db.get(User, row.user_id)` inside a list comprehension — one
    query per row. At 10k patients that is 10,001 queries and ~1.3s; batching it
    here makes it 2 queries and ~170ms.
    """
    ids = {uid for uid in user_ids if uid}
    if not ids:
        return {}
    rows = db.query(models.User).filter(models.User.id.in_(ids)).all()
    return {u.id: u for u in rows}


def patient_display(
    db: Session, patient_ids: Iterable[str], tenant_id: Optional[str] = None
) -> dict[str, tuple[str, str]]:
    """patient_id -> (name, phone), in one query. Empty tuple for unknown ids.

    `tenant_id` is the last line of defence against an identity leak. The ids
    handed in come off rows the caller may read, so they *should* already be
    within the tenant — but "should" is doing the work of an access check there.
    A row that got a foreign patient_id onto it by any route would otherwise
    have that id resolved to a real name and phone number and rendered into the
    wrong hospital's screen, turning a data-integrity slip into a disclosure.

    Optional only so the platform-wide superadmin views can still resolve names
    across tenants. Every tenant-scoped caller passes it.
    """
    ids = {pid for pid in patient_ids if pid}
    if not ids:
        return {}
    query = (
        db.query(models.Patient, models.User)
        .outerjoin(models.User, models.User.id == models.Patient.user_id)
        .filter(models.Patient.id.in_(ids))
    )
    if tenant_id:
        query = query.filter(models.Patient.hospital_id == tenant_id)
    rows = query.all()
    return {
        p.id: ((u.name if u else "") or "", (p.phone or (u.phone if u else "")) or "")
        for p, u in rows
    }


def doctor_display(
    db: Session, doctor_ids: Iterable[str], tenant_id: Optional[str] = None
) -> dict[str, str]:
    """doctor_id -> name, in one query. See patient_display for `tenant_id`."""
    ids = {did for did in doctor_ids if did}
    if not ids:
        return {}
    query = (
        db.query(models.Doctor, models.User)
        .outerjoin(models.User, models.User.id == models.Doctor.user_id)
        .filter(models.Doctor.id.in_(ids))
    )
    if tenant_id:
        query = query.filter(models.Doctor.hospital_id == tenant_id)
    rows = query.all()
    return {d.id: (u.name if u else "") or "" for d, u in rows}


def patient_name_search(query, model, q: Optional[str], *extra_columns, patient_id_column=None):
    """Narrow a query over `model` by its patient's name/phone, plus own columns.

    Rows like prescriptions and vitals are shown with the patient's name, so
    that is what a user types into the search box — but the name lives two
    joins away and the row itself has nothing to match. `extra_columns` are
    columns on the row that should match the same term.

    `patient_id_column` names the foreign key when it is not `patient_id` —
    a baby's is `mother_patient_id`.
    """
    if not q or not q.strip():
        return query
    like = f"%{q.strip().lower()}%"
    fk = patient_id_column if patient_id_column is not None else model.patient_id
    pat_user = aliased(models.User)
    columns = [
        func.lower(pat_user.name),
        func.lower(pat_user.phone),
        func.lower(models.Patient.phone),
        *[func.lower(col) for col in extra_columns],
    ]
    return (
        query.outerjoin(models.Patient, models.Patient.id == fk)
        .outerjoin(pat_user, pat_user.id == models.Patient.user_id)
        .filter(or_(*[col.like(like) for col in columns]))
    )


def attach_patient_names(
    db: Session,
    items: Sequence,
    *,
    id_attr: str = "patient_id",
    name_attr: str = "patient_name",
    tenant_id: Optional[str] = None,
) -> None:
    """Fill a display name on already-serialized rows carrying a patient id."""
    names = patient_display(
        db, (getattr(item, id_attr, None) for item in items), tenant_id
    )
    for item in items:
        setattr(item, name_attr, names.get(getattr(item, id_attr, None), ("", ""))[0])


def assert_no_duplicate_department_booking(
    db: Session,
    tenant_id: str,
    patient_id: str,
    department_id: str,
    date: str,
    exclude_appointment_id: Optional[str] = None,
) -> None:
    """Refuse a second live appointment for one patient in one department on
    one day — one booking per department per day is the rule regardless of
    which doctor it lands on or who is doing the booking.

    A cancelled appointment does not count against the patient: cancelling and
    rebooking the same day is the point of cancelling, not a way around this.
    `exclude_appointment_id` lets a reschedule check against every *other* row
    without tripping over the row it is itself moving.
    """
    query = db.query(models.Appointment).filter(
        models.Appointment.hospital_id == tenant_id,
        models.Appointment.patient_id == patient_id,
        models.Appointment.department_id == department_id,
        models.Appointment.date == date,
        models.Appointment.status != "cancelled",
    )
    if exclude_appointment_id:
        query = query.filter(models.Appointment.id != exclude_appointment_id)
    if query.first() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This patient already has an appointment in this department on this date",
        )


def appointment_name_search(query, q: Optional[str]):
    """Narrow an appointment query by patient name/phone or doctor name.

    The names live two joins away (appointment → patient → user), so an
    appointment row has nothing to match on by itself. Outer joins throughout:
    an appointment whose patient or doctor row is missing should still appear
    rather than silently vanish from a search.
    """
    if not q or not q.strip():
        return query
    like = f"%{q.strip().lower()}%"
    pat_user = aliased(models.User)
    doc_user = aliased(models.User)
    return (
        query.outerjoin(models.Patient, models.Patient.id == models.Appointment.patient_id)
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


# Columns an appointment list may be sorted by. Display names (patient, doctor)
# live two joins away and are resolved after the query, so they are not offered
# here. `id` is appended to every ordering as a stable tie-break across pages.
_APPOINTMENT_SORTABLE = {
    "date": models.Appointment.date,
    "status": models.Appointment.status,
    "created": models.Appointment.created_at,
}
DEFAULT_APPOINTMENT_SORT = "-date"


def _appointment_minutes_of_day():
    """`Appointment.time` as minutes since midnight, for ordering.

    The column holds a 12-hour slot label ("09:00 AM"), which sorts wrong as
    text — "02:00 PM" would come before "09:00 AM". Pull the parts out of the
    fixed-width label and fold AM/PM into a 24-hour minute count so two visits
    on the same day come back in clock order. A bare "HH:MM" (no meridiem) is
    read as already-24-hour.
    """
    t = models.Appointment.time
    hh = cast(func.substr(t, 1, 2), Integer)
    mm = cast(func.substr(t, 4, 2), Integer)
    meridiem = func.upper(func.substr(t, 7, 2))
    hour24 = case(
        ((meridiem == "AM") & (hh == 12), 0),
        ((meridiem == "PM") & (hh != 12), hh + 12),
        else_=hh,
    )
    return hour24 * 60 + mm


def apply_appointment_sort(query, sort: Optional[str]):
    """Order an appointment query by a `sort` token like `date` or `-status`.

    A leading `-` means descending. Anything unrecognised falls back to newest
    first — what the list showed before sorting was a parameter — so the default
    and every bad value behave identically.

    Sorting by `date` also orders by slot time within the day (same direction),
    so a day's appointments read in clock order rather than insertion order.
    """
    token = (sort or DEFAULT_APPOINTMENT_SORT).strip()
    descending = token.startswith("-")
    key = token[1:] if descending else token
    column = _APPOINTMENT_SORTABLE.get(key)
    if column is None:
        key, column, descending = "date", models.Appointment.date, True
    direction = (lambda c: c.desc()) if descending else (lambda c: c.asc())
    order = [direction(column)]
    if key == "date":
        order.append(direction(_appointment_minutes_of_day()))
    order.append(models.Appointment.id)
    return query.order_by(*order)


def attach_visit_stats(db: Session, items: Sequence) -> None:
    """Fill visit_count / last_visit / next_visit on already-serialized patients.

    Three grouped queries over the ids on this page. Derived here because the
    alternative is the client downloading every appointment in the hospital —
    or, on the platform screen, every appointment on the platform — to count
    rows it is only going to show a number for.
    """
    ids = [item.id for item in items]
    if not ids:
        return
    today = datetime.now(timezone.utc).date().isoformat()

    def grouped(agg, *conditions):
        return dict(
            db.query(models.Appointment.patient_id, agg)
            .filter(models.Appointment.patient_id.in_(ids), *conditions)
            .group_by(models.Appointment.patient_id)
            .all()
        )

    completed = grouped(func.count(), models.Appointment.status == "completed")
    last = grouped(
        func.max(models.Appointment.date),
        models.Appointment.status != "cancelled",
        models.Appointment.date <= today,
    )
    upcoming = grouped(
        func.min(models.Appointment.date),
        models.Appointment.status == "scheduled",
        models.Appointment.date >= today,
    )
    for item in items:
        item.visit_count = completed.get(item.id, 0)
        item.last_visit = last.get(item.id)
        item.next_visit = upcoming.get(item.id)


def attach_active_pregnancy(db: Session, items: Sequence) -> None:
    """Fill active_pregnancy on already-serialized patients.

    One query over the ids on this page, the same shape as attach_visit_stats.
    Without this the patient chart — and the patient list — had no way to know
    a patient was pregnant short of a separate trip to /pregnancies, which is
    exactly the disconnect between the patient record and the pregnancy module
    that let three screens each collect their own LMP with nothing reconciling
    them. A patient carries at most one active pregnancy in practice; if more
    than one row is ever open, the most recently created one wins.
    """
    # Imported here, not at module level: utils is imported very early (by
    # audit.py, which schemas.py's own dependency chain reaches), so a
    # top-level `from . import schemas` here is a circular import.
    from . import schemas

    ids = [item.id for item in items]
    if not ids:
        return
    rows = (
        db.query(models.PregnancyRecord)
        .filter(
            models.PregnancyRecord.patient_id.in_(ids),
            models.PregnancyRecord.status == "active",
        )
        .order_by(models.PregnancyRecord.created_at)
        .all()
    )
    by_patient: dict[str, models.PregnancyRecord] = {}
    for row in rows:
        # Rows arrive oldest-first, so the last one seen per patient is the newest.
        by_patient[row.patient_id] = row
    for item in items:
        record = by_patient.get(item.id)
        item.active_pregnancy = (
            schemas.ActivePregnancySummary.model_validate(record) if record else None
        )


def appointments_with_vitals(db: Session, appointment_ids: Iterable[str]) -> set[str]:
    """Which of these appointments already have vitals recorded, in one query."""
    ids = {aid for aid in appointment_ids if aid}
    if not ids:
        return set()
    rows = (
        db.query(models.Vitals.appointment_id)
        .filter(models.Vitals.appointment_id.in_(ids))
        .distinct()
        .all()
    )
    return {row[0] for row in rows}


@dataclass
class AppointmentBill:
    """The consultation bill attached to an appointment, as a list needs it."""

    payment_id: str
    amount: float
    status: str
    payment_method: str


def appointment_bills(
    db: Session, appointment_ids: Iterable[str], tenant_id: str
) -> dict[str, AppointmentBill]:
    """The consultation bill for each of these appointments, in one query.

    Answers "is this visit paid for" on the appointment itself rather than
    making the client fetch payment rows — the same shape as
    `appointments_with_vitals`, and the same reason: a table of twenty
    appointments should not cost twenty round trips, and a doctor who may read
    an appointment but not the payments ledger can still be told whether the
    patient has settled at the desk.

    Only consultation payments are considered. A pharmacy or lab payment can
    share a patient but never answers "was this visit paid for".
    """
    ids = {aid for aid in appointment_ids if aid}
    if not ids:
        return {}
    rows = (
        db.query(models.Payment)
        .filter(models.Payment.hospital_id == tenant_id)
        .filter(models.Payment.appointment_id.in_(ids))
        .filter(models.Payment.payment_type == "consultation")
        # Oldest first so that when a visit somehow carries more than one bill,
        # the one the desk raised at booking is the one reported.
        .order_by(models.Payment.created_at.asc())
        .all()
    )
    bills: dict[str, AppointmentBill] = {}
    for row in rows:
        if row.appointment_id in bills:
            continue
        bills[row.appointment_id] = AppointmentBill(
            payment_id=row.id,
            amount=float(row.amount or 0),
            status=row.status or "",
            payment_method=row.payment_method or "",
        )
    return bills


@dataclass
class ResultSummary:
    """What a lab order's table row needs to say about its report."""

    has_results: bool = False
    abnormal: bool = False
    reported_at: str = ""
    reported_by: str = ""


def result_summaries(db: Session, order_ids: Iterable[str]) -> dict[str, ResultSummary]:
    """order_id -> its report summary, in one query.

    A lab order's row shows whether a report exists, whether anything on it is
    flagged, and who reported it when. Deriving those in the client means
    fetching every test result in the hospital to read four fields, so the
    summary is computed here over the ids on the page.
    """
    ids = {oid for oid in order_ids if oid}
    if not ids:
        return {}
    summaries: dict[str, ResultSummary] = {}
    rows = (
        db.query(
            models.TestResult.order_id,
            models.TestResult.parameters,
            models.TestResult.reported_at,
            models.TestResult.reported_by,
        )
        .filter(models.TestResult.order_id.in_(ids))
        .all()
    )
    for order_id, parameters, reported_at, reported_by in rows:
        # A missing flag means the lab has not judged it; that is not abnormal.
        flagged = any(
            (p or {}).get("flag", "normal") != "normal" for p in (parameters or [])
        )
        current = summaries.setdefault(order_id, ResultSummary())
        current.has_results = True
        current.abnormal = current.abnormal or flagged
        # An order can carry several results; report the earliest, which is the
        # one the client showed when it took results[0] of its own list.
        if not current.reported_at or (reported_at or "") < current.reported_at:
            current.reported_at = reported_at or ""
            current.reported_by = reported_by or ""
    return summaries


def attach_users(
    db: Session,
    rows: Sequence[T],
    schema,
    user_schema,
) -> list:
    """Serialize `rows`, attaching each row's user without an N+1."""
    users = users_by_id(db, (getattr(r, "user_id", None) for r in rows))
    out = []
    for row in rows:
        item = schema.model_validate(row)
        user = users.get(getattr(row, "user_id", None))
        if user:
            item.user = user_schema.model_validate(user)
        out.append(item)
    return out
