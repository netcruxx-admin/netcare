"""Tenant-resolution seam — the server counterpart of the frontend's
lib/tenant.ts + the withTenant()/scoped() helpers in lib/db.ts.

Two resolution paths:

  * Authenticated requests -> the tenant is taken from the caller's user row
    (which came from a validated JWT). This is authoritative and cannot be
    spoofed via the URL. A platform `superadmin` has no home tenant, so they
    target one explicitly with an `X-Hospital-Id` header (gated to superadmins).

  * Pre-login requests (login / register / GET /hospitals/current) have no user
    yet, so the tenant is resolved from the request host's subdomain
    (sunrise.localhost -> the hospital whose subdomain is "sunrise"), with an
    `X-Hospital-Id` header override for demoing on bare localhost, falling back
    to the default hospital.
"""

from typing import Optional

from fastapi import Depends, Header, HTTPException, Request, status
from sqlalchemy.orm import Query, Session

from . import models
from .auth import get_current_user
from .config import settings
from .database import get_db


def scoped(db: Session, model, tenant_id: str) -> Query:
    """Narrow a collection to one tenant's rows. Use this instead of a bare
    db.query(model) for every tenant-owned table."""
    return db.query(model).filter(model.hospital_id == tenant_id)


def _subdomain_label(host: str) -> Optional[str]:
    """The subdomain label of a request host, or None on the bare host."""
    label = host.split(":")[0].split(".")[0]
    if not label or label in ("localhost", "www"):
        return None
    if label.replace(".", "").isdigit():  # raw IP, e.g. 127.0.0.1
        return None
    return label


def resolve_public_tenant(
    request: Request,
    db: Session = Depends(get_db),
    x_hospital_id: Optional[str] = Header(default=None),
) -> str:
    """Tenant for pre-login requests: explicit header > subdomain > default."""
    if x_hospital_id:
        hospital = db.get(models.Hospital, x_hospital_id)
        if hospital is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown hospital")
        return hospital.id

    label = _subdomain_label(request.headers.get("host", ""))
    if label:
        hospital = (
            db.query(models.Hospital)
            .filter(models.Hospital.subdomain == label)
            .first()
        )
        if hospital is not None:
            return hospital.id

    return settings.default_hospital_id


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
        return x_hospital_id

    if not user.hospital_id:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "User is not attached to a hospital"
        )
    return user.hospital_id
