"""Reading the access trail.

Read-only by design — there is no POST, PUT or DELETE here and there never
should be. The trail is written by the middleware from facts about what
happened; a client that could add to it or edit it could also launder an access,
which is exactly what an inspection is trying to rule out.

The permission is `audit.read`, held by a hospital admin (their own tenant's
trail) and a superadmin (any tenant's, via X-Hospital-Id). Clinicians do not
hold it: the trail records who opened which chart, and that is personnel data
about colleagues as much as it is a compliance record.
"""

from typing import Optional

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from .. import models, schemas
from ..authz import require_permission
from ..database import get_db
from ..tenancy import get_tenant_id, scoped
from ..utils import (
    ListQuery,
    list_params,
    paginate,
    patient_display,
    text_search,
    users_by_id,
)

router = APIRouter(prefix="/audit-logs", tags=["audit"])


@router.get("", response_model=list[schemas.AuditLogOut])
def list_audit_logs(
    response: Response,
    patient_id: Optional[str] = Query(default=None, alias="patientId"),
    actor_user_id: Optional[str] = Query(default=None, alias="actorUserId"),
    action: Optional[str] = None,
    outcome: Optional[str] = None,
    date_from: Optional[str] = Query(default=None, alias="from"),
    date_to: Optional[str] = Query(default=None, alias="to"),
    params: ListQuery = Depends(list_params),
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("audit.read")),
    tenant_id: str = Depends(get_tenant_id),
):
    """The trail for this hospital, newest first.

    The filters are the questions the obligations actually ask:
    `patientId` answers "who has opened this patient's record?" (ISO 27789 /
    DPDP subject access), `actorUserId` answers "what did this employee see?"
    (the question after a staff member is dismissed), and
    `outcome=denied` surfaces attempted access to records the caller had no
    right to — the CERT-In early-warning view.
    """
    query = scoped(db, models.AuditLog, tenant_id)
    if patient_id:
        query = query.filter(models.AuditLog.patient_id == patient_id)
    if actor_user_id:
        query = query.filter(models.AuditLog.actor_user_id == actor_user_id)
    if action:
        query = query.filter(models.AuditLog.action == action)
    if outcome:
        query = query.filter(models.AuditLog.outcome == outcome)
    # created_at is a sortable ISO-8601 string, so a plain range works. `to` is
    # compared with < against the day after when a bare date is given, so
    # to=2026-08-02 includes that whole day rather than only its midnight.
    if date_from:
        query = query.filter(models.AuditLog.created_at >= date_from)
    if date_to:
        upper = date_to if len(date_to) > 10 else f"{date_to}T23:59:59.999999+00:00"
        query = query.filter(models.AuditLog.created_at <= upper)

    query = text_search(
        query,
        [
            models.AuditLog.path,
            models.AuditLog.permission,
            models.AuditLog.actor_role,
            models.AuditLog.actor_ip,
            models.AuditLog.subject_id,
            models.AuditLog.detail,
        ],
        params.q,
    )
    query = query.order_by(models.AuditLog.created_at.desc(), models.AuditLog.id)
    rows = paginate(query, response, params.limit, params.offset).all()

    out = [schemas.AuditLogOut.model_validate(row) for row in rows]
    # Two batched lookups rather than one per row — an audit screen pages
    # through thousands of rows and each one names two people.
    actors = users_by_id(db, (r.actor_user_id for r in rows))
    patients = patient_display(db, (r.patient_id for r in rows), tenant_id)
    for item in out:
        actor = actors.get(item.actor_user_id or "")
        item.actor_name = actor.name if actor else ""
        item.patient_name = patients.get(item.patient_id or "", ("", ""))[0]
    return out
