from datetime import datetime, timezone
from typing import Iterable, Optional, Sequence, TypeVar
from uuid import uuid4

from fastapi import Response
from sqlalchemy.orm import Session

from . import models

T = TypeVar("T")


def new_id(prefix: str) -> str:
    return f"{prefix}-{uuid4().hex[:8]}"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


#: Largest page a client may ask for. A caller passing limit=100000 should not
#: be able to undo pagination.
MAX_PAGE_SIZE = 200


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


def patient_display(db: Session, patient_ids: Iterable[str]) -> dict[str, tuple[str, str]]:
    """patient_id -> (name, phone), in one query. Empty tuple for unknown ids."""
    ids = {pid for pid in patient_ids if pid}
    if not ids:
        return {}
    rows = (
        db.query(models.Patient, models.User)
        .outerjoin(models.User, models.User.id == models.Patient.user_id)
        .filter(models.Patient.id.in_(ids))
        .all()
    )
    return {
        p.id: ((u.name if u else "") or "", (p.phone or (u.phone if u else "")) or "")
        for p, u in rows
    }


def doctor_display(db: Session, doctor_ids: Iterable[str]) -> dict[str, str]:
    """doctor_id -> name, in one query."""
    ids = {did for did in doctor_ids if did}
    if not ids:
        return {}
    rows = (
        db.query(models.Doctor, models.User)
        .outerjoin(models.User, models.User.id == models.Doctor.user_id)
        .filter(models.Doctor.id.in_(ids))
        .all()
    )
    return {d.id: (u.name if u else "") or "" for d, u in rows}


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
