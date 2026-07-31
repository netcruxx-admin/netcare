"""The grantable permission catalog — superadmin only.

Read-only over HTTP: permissions come into existence with the feature that
enforces them, so they arrive by migration, never by API. What a superadmin
*does* control is which roles hold them (see routers/roles.py). This endpoint
exists so the permission matrix in the UI is built from the live catalog rather
than a list duplicated in the frontend.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import models, schemas
from ..authz import require_permission
from ..database import get_db

router = APIRouter(prefix="/permissions", tags=["permissions"])


@router.get("", response_model=list[schemas.PermissionOut])
def list_permissions(
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("roles.manage")),
):
    return (
        db.query(models.Permission)
        .order_by(models.Permission.sort_order, models.Permission.code)
        .all()
    )
