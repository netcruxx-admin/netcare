from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Iterable, Optional, Sequence, TypeVar
from uuid import uuid4

from fastapi import Query, Response
from sqlalchemy import func, or_
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
