from typing import Optional

"""The grantable permission catalog — superadmin only.

Read-only over HTTP: permissions come into existence with the feature that
enforces them, so they arrive by migration, never by API. What a superadmin
*does* control is which roles hold them (see routers/roles.py). This endpoint
exists so the permission matrix in the UI is built from the live catalog rather
than a list duplicated in the frontend.
"""

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from .. import models, schemas
from ..authz import require_permission
from ..database import get_db
from ..utils import ListQuery, list_params, paginate, text_search

router = APIRouter(prefix="/permissions", tags=["permissions"])


@router.get("", response_model=list[schemas.PermissionOut])
def list_permissions(
    response: Response,
    resource: Optional[str] = Query(default=None),
    module: Optional[str] = Query(default=None),
    params: ListQuery = Depends(list_params),
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("roles.manage")),
):
    query = db.query(models.Permission)
    if resource:
        query = query.filter(models.Permission.resource == resource)
    if module:
        query = query.filter(models.Permission.module == module)
    query = text_search(
        query,
        [
            models.Permission.code,
            models.Permission.label,
            models.Permission.description,
            models.Permission.resource,
        ],
        params.q,
    )
    query = query.order_by(models.Permission.sort_order, models.Permission.code)
    return paginate(query, response, params.limit, params.offset).all()
