"""The access trail — who touched whose record, when, and under what authority.

Three separate rules ask for this file, and one table answers all of them:

  * **EHR Standards for India, 2016** adopt ISO 27789, which requires an audit
    trail over every access to an electronic health record — not just writes.
    "Dr X opened this chart" is itself the auditable event.
  * **DPDP Act 2023** requires a Data Fiduciary to keep reasonable security
    safeguards and to be able to reconstruct a breach after the fact.
  * **CERT-In Directions (April 2022)** require logs to be retained *in India*
    for 180 days and produced on demand.

Design, and why it is not a `log.info()` in every handler:

  Every clinical endpoint in this app already passes through two dependencies —
  `get_current_user` (who) and `require_permission` (under what authority). Those
  are the only two facts a handler would have added by hand, so the trail is
  assembled from the seams that already exist rather than from 22 routers each
  remembering to call something. A new router is audited the day it is written,
  because it cannot serve a request without going through those dependencies.

  The middleware owns the row. It opens the event before routing, the
  dependencies fill in what they know as the request flows through, and the
  middleware writes it once the status code is known. That ordering is what lets
  a **403 be audited** — a denied access attempt is the single most interesting
  line in a medico-legal review, and a handler-level call would never run.

What is deliberately *not* recorded: request bodies and query strings. A body
carries diagnoses and passwords, and an audit table that duplicates the medical
record is a second copy to breach. Rows name records by id; to see what was in
one, read the record.

Retention: nothing here deletes. 180 days is the CERT-In floor, but the NMC
Ethics Regulations want the underlying record for three years and a medico-legal
case can reopen long after that, so purging is a policy decision for the
operator, not a default. `purge_older_than()` exists for when they make it.
"""

from __future__ import annotations

import sys
import traceback
from contextvars import ContextVar
from dataclasses import dataclass, field
from time import perf_counter
from typing import Optional
from uuid import uuid4

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from . import models
from .database import SessionLocal
from .utils import now_iso

# Paths that carry no health data and would otherwise bury the trail in noise.
_EXEMPT_PATHS = {"/", "/docs", "/redoc", "/openapi.json", "/favicon.ico"}

# HTTP verb -> the word an auditor reads. Kept coarse on purpose: the permission
# code already says *what* capability was exercised, so this only needs to say
# whether data was read or changed.
_ACTION_BY_METHOD = {
    "GET": "read",
    "HEAD": "read",
    "POST": "create",
    "PUT": "update",
    "PATCH": "update",
    "DELETE": "delete",
}


@dataclass
class AuditEvent:
    """One request's trail, mutated in place as the request flows through.

    A dataclass rather than a dict so the field set is checked at import time,
    and stored in a ContextVar *by reference*: Starlette runs the endpoint in a
    child task, which gets a copy of the context but the same object, so what a
    dependency writes here is visible to the middleware afterwards. Rebinding
    the ContextVar inside the request would not propagate back — mutate, never
    reassign.
    """

    request_id: str
    method: str
    path: str
    ip: str = ""
    user_agent: str = ""
    # Filled by get_current_user once the token is validated.
    actor_user_id: Optional[str] = None
    actor_role: str = ""
    hospital_id: Optional[str] = None
    # Filled by require_permission — the authority the caller acted under.
    permission: str = ""
    scope: Optional[str] = None
    # The record touched. Derived from path params, or named by the handler.
    subject_type: str = ""
    subject_id: str = ""
    # The person the data is *about*, which is the column an inspector filters
    # on. Often the same as subject_id; not always (a lab order is about its
    # patient, not about the order).
    patient_id: Optional[str] = None
    action: str = ""
    detail: str = ""
    # Set to False by skip() for endpoints that should leave no trail.
    enabled: bool = True
    _started: float = field(default_factory=perf_counter)


_current: ContextVar[Optional[AuditEvent]] = ContextVar("audit_event", default=None)


def current_event() -> Optional[AuditEvent]:
    """The event for the request in flight, or None outside a request."""
    return _current.get()


def record_actor(user: models.User) -> None:
    """Name the caller. Called from get_current_user, so every authenticated
    request identifies its actor without any router taking part."""
    event = _current.get()
    if event is None:
        return
    event.actor_user_id = user.id
    event.actor_role = user.role or ""
    # A superadmin has no home tenant; get_tenant_id resolves the one they are
    # acting on, so leave whatever the middleware or a later call already set.
    if user.hospital_id:
        event.hospital_id = user.hospital_id


def record_permission(code: str, scope: Optional[str]) -> None:
    """Name the authority being exercised. Called from require_permission
    *before* the check, so a denial is recorded with the permission it wanted."""
    event = _current.get()
    if event is None:
        return
    # An endpoint guarded by several permissions records each one it matched;
    # the first is the one that admitted the caller.
    if event.permission and code not in event.permission.split(","):
        event.permission = f"{event.permission},{code}"
    elif not event.permission:
        event.permission = code
        event.scope = scope


def record_tenant(hospital_id: str) -> None:
    """Name the tenant acted on — the superadmin case, where it is not the
    caller's own hospital."""
    event = _current.get()
    if event is not None and hospital_id:
        event.hospital_id = hospital_id


def record_subject(
    subject_type: str = "",
    subject_id: str = "",
    *,
    patient_id: Optional[str] = None,
    detail: str = "",
) -> None:
    """Name the record touched, when the path cannot say it.

    Most endpoints need nothing: `/patients/{patient_id}` is self-describing and
    the middleware reads it off the route. This is for the rest — a collection
    filtered to one patient by query param, or a login, where the interesting
    subject never appears in the path.
    """
    event = _current.get()
    if event is None:
        return
    if subject_type:
        event.subject_type = subject_type
    if subject_id:
        event.subject_id = subject_id
    if patient_id:
        event.patient_id = patient_id
    if detail:
        event.detail = detail


def record_action(action: str) -> None:
    """Override the verb-derived action, for events HTTP has no word for —
    `login`, `login_failed`, `permission_denied`."""
    event = _current.get()
    if event is not None:
        event.action = action


def skip() -> None:
    """Leave no trail for this request. Only for endpoints that touch no
    personal data at all — health checks, not "this one is noisy"."""
    event = _current.get()
    if event is not None:
        event.enabled = False


def _client_ip(request: Request) -> str:
    """The caller's address, honouring one proxy hop.

    X-Forwarded-For is client-settable and therefore not evidence on its own,
    but behind the load balancer this will run behind it is the only way to see
    past the proxy. Recorded as-is; treat it as a hint, not proof.
    """
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()[:64]
    return (request.client.host if request.client else "")[:64]


def _route_template(request: Request) -> str:
    """The matched route pattern (`/patients/{patient_id}`) rather than the
    concrete path, so an inspector can group by endpoint instead of by id."""
    route = request.scope.get("route")
    return getattr(route, "path", "") or request.url.path


def _subject_from_path(request: Request, event: AuditEvent) -> None:
    """Read the record's identity off the URL when the handler did not say it.

    `/patients/{patient_id}` names both the subject and the data subject;
    `/appointments/{appointment_id}` names only the subject. Anything the
    handler set explicitly wins — it knows more than the path does.
    """
    params = request.scope.get("path_params") or {}
    if not params:
        return
    if not event.patient_id and isinstance(params.get("patient_id"), str):
        event.patient_id = params["patient_id"]
    if event.subject_id:
        return
    # Prefer the id the route is *about*: the last {..._id} in the template is
    # the resource being addressed, not the parent collection.
    for key in reversed(list(params)):
        value = params[key]
        if isinstance(value, str):
            event.subject_id = value
            if not event.subject_type:
                event.subject_type = key.removesuffix("_id")
            return


def _persist(event: AuditEvent, status_code: int, outcome: str) -> None:
    """Write the row on its own session.

    Its own, because the request's session is already closed by the time the
    middleware runs, and because an audit row must survive a handler that rolled
    back — a write that failed halfway is still an access that happened.
    """
    db = SessionLocal()
    try:
        db.add(
            models.AuditLog(
                id=f"aud-{uuid4().hex[:12]}",
                request_id=event.request_id,
                hospital_id=event.hospital_id,
                actor_user_id=event.actor_user_id,
                actor_role=event.actor_role,
                actor_ip=event.ip,
                user_agent=event.user_agent,
                method=event.method,
                path=event.path,
                permission=event.permission,
                scope=event.scope,
                subject_type=event.subject_type,
                subject_id=event.subject_id,
                patient_id=event.patient_id,
                action=event.action or _ACTION_BY_METHOD.get(event.method, "other"),
                status_code=status_code,
                outcome=outcome,
                detail=event.detail,
                duration_ms=int((perf_counter() - event._started) * 1000),
                created_at=now_iso(),
            )
        )
        db.commit()
    except Exception:  # noqa: BLE001 - see below
        db.rollback()
        # The request already succeeded; raising here would turn a logging fault
        # into a clinical outage, and a doctor who cannot open a chart because
        # the audit table is full is a worse outcome than a gap in the trail.
        # The gap is real though, so it goes to stderr where the platform's log
        # shipper will see it — wire an alert to this line before go-live, since
        # silent audit loss is exactly what an inspection looks for.
        print(
            f"AUDIT WRITE FAILED request_id={event.request_id} "
            f"path={event.path} actor={event.actor_user_id}",
            file=sys.stderr,
        )
        traceback.print_exc(file=sys.stderr)
    finally:
        db.close()


class AuditMiddleware(BaseHTTPMiddleware):
    """Opens an audit event around every request and writes it once resolved."""

    async def dispatch(self, request: Request, call_next):
        if request.method == "OPTIONS" or request.url.path in _EXEMPT_PATHS:
            return await call_next(request)

        event = AuditEvent(
            request_id=uuid4().hex,
            method=request.method,
            path=request.url.path,
            ip=_client_ip(request),
            user_agent=request.headers.get("user-agent", "")[:256],
        )
        token = _current.set(event)
        try:
            try:
                response = await call_next(request)
            except Exception:
                # An unhandled fault is still an access attempt, and the one
                # most worth having a record of.
                event.path = _route_template(request) or event.path
                _subject_from_path(request, event)
                _persist(event, 500, "error")
                raise

            event.path = _route_template(request) or event.path
            _subject_from_path(request, event)

            if event.enabled:
                status_code = response.status_code
                if status_code in (401, 403):
                    outcome = "denied"
                elif status_code >= 500:
                    outcome = "error"
                elif status_code >= 400:
                    outcome = "failed"
                else:
                    outcome = "success"
                _persist(event, status_code, outcome)

            # Lets support correlate a user's report with the exact trail rows.
            response.headers["X-Request-Id"] = event.request_id
            return response
        finally:
            _current.reset(token)


def purge_older_than(db, days: int) -> int:
    """Delete trail rows older than `days`, returning how many went.

    Not scheduled anywhere and not called by the app. Retention is the
    operator's decision and the floors conflict: CERT-In wants 180 days minimum,
    the NMC Ethics Regulations want the underlying record for three years, and a
    medico-legal case can reopen later still. Whoever runs the deployment picks
    a number and a cron; this is the only supported way to act on it, so that
    deletion happens in one reviewable place rather than by hand in psql.
    """
    from datetime import datetime, timedelta, timezone

    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    deleted = (
        db.query(models.AuditLog)
        .filter(models.AuditLog.created_at < cutoff)
        .delete(synchronize_session=False)
    )
    db.commit()
    return deleted
