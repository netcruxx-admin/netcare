"""Tenant-resolution seam — the server counterpart of the frontend's
lib/tenant.ts + the withTenant()/scoped() helpers in lib/db.ts.

Two resolution paths:

  * Authenticated requests -> the tenant is taken from the caller's user row
    (which came from a validated JWT). This is authoritative and cannot be
    spoofed via the URL. A platform `superadmin` has no home tenant, so they
    target one explicitly with an `X-Hospital-Id` header (gated to superadmins).

  * Pre-login requests (login / register / GET /hospitals/current) have no user
    yet, so the tenant is resolved from the request host's subdomain
    (hospA.netcare.co.in -> the hospital whose subdomain is "hospA"), with an
    `X-Hospital-Id` header override for demoing on bare localhost. There is no
    fallback: an unrecognised host resolves to no tenant, because guessing one
    would file a sign-up under a hospital the user never chose.

Deployment note: this reads the *request* host, so the API has to be reachable
on the tenant's own hostname — hospA.netcare.co.in/api/... behind a path proxy.
Serving it from api.netcare.co.in instead resolves every request to the label
"api", which is no hospital, and no tenant user can sign in.
"""

from typing import Optional

from fastapi import Depends, Header, HTTPException, Request, status
from sqlalchemy.orm import Query, Session

from . import audit, models
from .auth import get_current_user
from .config import settings
from .database import get_db


def scoped(db: Session, model, tenant_id: str) -> Query:
    """Narrow a collection to one tenant's rows. Use this instead of a bare
    db.query(model) for every tenant-owned table."""
    return db.query(model).filter(model.hospital_id == tenant_id)


def _subdomain_label(host: str) -> Optional[str]:
    """The tenant label of a request host, or None when there is not one.

    Mirrors `tenantLabel()` in the frontend's middleware.ts and
    `currentSubdomain()` in lib/tenant.ts. Three copies because they run in
    three places, and all three must agree about what counts as a tenant.
    """
    hostname = host.split(":")[0].lower()
    parts = hostname.split(".")
    # A single label is the bare host: "localhost", or an internal hostname.
    if len(parts) < 2:
        return None
    # A raw IP has no subdomain to read.
    if parts[-1].isdigit():
        return None
    # The apex is the platform, not a tenant. Without this, "netcare.co.in"
    # reads as a hospital called "netcare" — harmless only until someone
    # onboards that subdomain, at which point the platform's own front door
    # starts resolving to a real hospital.
    if settings.root_domain and hostname == settings.root_domain.strip().lower():
        return None
    label = parts[0]
    if not label or label in ("localhost", "www"):
        return None
    return label


def assert_in_tenant(db: Session, model, record_id: Optional[str], tenant_id: str) -> None:
    """Refuse a request whose body points at another tenant's row.

    Tenant scoping protects what a caller can *read*; it does nothing about what
    they can *reference*. A create whose foreign keys are taken from the body
    unchecked will happily file a row in your own tenant that points into
    someone else's — and the display helpers then resolve those ids to a name
    and a phone number, so an integrity slip becomes a disclosure.

    404 rather than 403, for the reason it always is here: a 403 would confirm
    the id exists, which is the fact being protected.
    """
    if not record_id:
        return
    exists = (
        db.query(model.id)
        .filter(model.id == record_id, model.hospital_id == tenant_id)
        .first()
    )
    if exists is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            f"{model.__tablename__[:-1] if model.__tablename__.endswith('s') else model.__tablename__} not found",
        )


# Every foreign key a request body may carry, and the table it points at. Kept
# here rather than restated per router so a new schema field named `patient_id`
# is covered the day it is added, instead of the day someone notices.
#
# Only tenant-owned targets belong in this map. A `medicine_id` names a row in
# the tenant's own catalogue and is exactly as leakable as a patient.
_BODY_FOREIGN_KEYS: dict = {}


def _body_foreign_keys() -> dict:
    """Resolved lazily so this module does not depend on import order."""
    if not _BODY_FOREIGN_KEYS:
        _BODY_FOREIGN_KEYS.update(
            {
                "patient_id": models.Patient,
                "mother_patient_id": models.Patient,
                "doctor_id": models.Doctor,
                "department_id": models.Department,
                "appointment_id": models.Appointment,
                "pregnancy_id": models.PregnancyRecord,
                "baby_id": models.Baby,
                "order_id": models.TestOrder,
                "test_id": models.LabTest,
                "medicine_id": models.Medicine,
                "prescription_id": models.Prescription,
            }
        )
    return _BODY_FOREIGN_KEYS


def assert_body_in_tenant(db: Session, body, tenant_id: str, *, skip: tuple = ()) -> None:
    """Check every foreign key on a request body against the caller's tenant.

    The reason this is a sweep rather than three named calls per handler: most
    creates splat `**body.model_dump()` onto the model, so the foreign key never
    appears in the router's source at all. Grepping for `body.patient_id` finds
    nothing while the id still lands on the row — which is exactly how the
    appointments hole went unnoticed.

    Recurses into nested models and lists of them, because a lab order carries
    its test ids inside `items` rather than at the top level.

    `skip` is for the handler that has already checked a field itself, or where
    the id legitimately names something outside the tenant.
    """
    fks = _body_foreign_keys()
    for field, model in fks.items():
        if field in skip:
            continue
        value = getattr(body, field, None)
        if isinstance(value, str) and value:
            assert_in_tenant(db, model, value, tenant_id)

    # Nested payloads. `model_fields` is the Pydantic v2 way to walk a body
    # without guessing at its shape.
    for field in getattr(type(body), "model_fields", {}):
        if field in fks:
            continue
        value = getattr(body, field, None)
        # `model_fields` is read off the class, not the instance: Pydantic 2.11
        # deprecated the instance access and removes it in v3.
        if hasattr(type(value), "model_fields"):
            assert_body_in_tenant(db, value, tenant_id, skip=skip)
        elif isinstance(value, (list, tuple)):
            for item in value:
                if hasattr(type(item), "model_fields"):
                    assert_body_in_tenant(db, item, tenant_id, skip=skip)


def resolve_public_tenant(
    request: Request,
    db: Session = Depends(get_db),
    x_hospital_id: Optional[str] = Header(default=None),
) -> str:
    """Tenant for pre-login requests, resolved from the request host.

    Returns "" when no tenant could be determined. Callers must decide what that
    means for them: /auth/login treats it as "not a tenant user" and falls back
    to the platform superadmin lookup, while /auth/register refuses outright —
    it must never guess which hospital an account belongs to.

    `X-Hospital-Id` is honoured only in development. On a pre-login request the
    header is attacker-controlled, so trusting it in production would let anyone
    create an account inside any hospital regardless of the host they came in
    on. In production the host subdomain is the only input.
    """
    if x_hospital_id and not settings.is_production:
        hospital = db.get(models.Hospital, x_hospital_id)
        if hospital is None:
            # Also try treating the value as a subdomain label (frontend sends
            # the label when on e.g. cityeyecare.localhost:3000).
            hospital = (
                db.query(models.Hospital)
                .filter(models.Hospital.subdomain == x_hospital_id)
                .first()
            )
        if hospital is not None:
            return hospital.id
        # Still not found — fall through so superadmin can log in before
        # any hospital has been onboarded.

    label = _subdomain_label(request.headers.get("host", ""))
    if label:
        hospital = (
            db.query(models.Hospital)
            .filter(models.Hospital.subdomain == label)
            .first()
        )
        if hospital is not None:
            return hospital.id

    return ""


def get_tenant_id(
    user: models.User = Depends(get_current_user),
    x_hospital_id: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
) -> str:
    """Tenant for authenticated requests. Normal users are locked to their own
    hospital; a superadmin acts on the hospital named in X-Hospital-Id."""
    if user.role == "superadmin":
        if not x_hospital_id:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "Superadmin must target a hospital via the X-Hospital-Id header",
            )
        if db.get(models.Hospital, x_hospital_id) is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown hospital")
        # A superadmin has no home tenant, so the trail row would otherwise have
        # no hospital on it — and a platform user reaching into a hospital's
        # records is precisely the access that hospital wants to see.
        audit.record_tenant(x_hospital_id)
        return x_hospital_id

    if not user.hospital_id:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "User is not attached to a hospital"
        )
    return user.hospital_id
