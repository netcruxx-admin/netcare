"""Role catalog CRUD — superadmin only.

Roles are platform-wide (not tenant-scoped): every hospital draws from the same
catalog, which is what lets `users.role` carry a FK to `roles.code`. Only a
platform superadmin may read or change the catalog; a tenant admin picking a
role for a new user gets the list from their own user-management endpoints.
"""

import re
from typing import get_args

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import get_current_user
from ..authz import SCOPE_ALL, SCOPE_OWN, require_permission
from ..database import get_db

router = APIRouter(prefix="/roles", tags=["roles"])

# The six codes the application itself depends on: schemas.Role is a Literal
# over them, the frontend routes dashboards by them, and seed.py provisions
# them. They can be relabelled or reordered but never renamed or removed.
BUILTIN_CODES = {"superadmin", "admin", "doctor", "nurse", "lab", "patient"}

CODE_PATTERN = re.compile(r"^[a-z][a-z0-9_-]{1,31}$")

# Read off RegisterRole so the two can't drift: whatever /auth/register accepts
# is exactly what the UI is told is self-registerable.
REGISTERABLE_CODES = frozenset(get_args(schemas.RegisterRole))


def _user_count(db: Session, code: str) -> int:
    return db.query(models.User).filter(models.User.role == code).count()


def _grants(db: Session, code: str) -> list[schemas.PermissionGrant]:
    rows = (
        db.query(models.RolePermission)
        .filter(models.RolePermission.role_code == code)
        .all()
    )
    return [
        schemas.PermissionGrant(code=r.permission_code, scope=r.scope) for r in rows
    ]


def _set_grants(
    db: Session, code: str, permissions: list[schemas.PermissionGrant]
) -> None:
    """Replace a role's grants wholesale.

    Validates every code against the catalog first, so a typo is a 422 rather
    than a silently missing capability — the failure mode that would otherwise
    be discovered by a user hitting a 403 they shouldn't.
    """
    requested = {grant.code: grant.scope for grant in permissions}
    if requested:
        known = {
            p.code: p
            for p in db.query(models.Permission)
            .filter(models.Permission.code.in_(requested.keys()))
            .all()
        }
        unknown = sorted(set(requested) - set(known))
        if unknown:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                f"Unknown permission(s): {', '.join(unknown)}",
            )
        for permission_code, scope in requested.items():
            permission = known[permission_code]
            if scope is not None and not permission.supports_scope:
                raise HTTPException(
                    status.HTTP_422_UNPROCESSABLE_ENTITY,
                    f"'{permission_code}' does not take a scope",
                )
            if permission.supports_scope and scope not in (SCOPE_OWN, SCOPE_ALL):
                raise HTTPException(
                    status.HTTP_422_UNPROCESSABLE_ENTITY,
                    f"'{permission_code}' needs a scope of '{SCOPE_OWN}' or '{SCOPE_ALL}'",
                )

    db.query(models.RolePermission).filter(
        models.RolePermission.role_code == code
    ).delete(synchronize_session=False)
    for permission_code, scope in requested.items():
        db.add(
            models.RolePermission(
                role_code=code, permission_code=permission_code, scope=scope
            )
        )


def _to_out(db: Session, role: models.Role) -> schemas.RoleOut:
    out = schemas.RoleOut.model_validate(role)
    out.user_count = _user_count(db, role.code)
    out.permissions = _grants(db, role.code)
    return out


def _get_or_404(db: Session, code: str) -> models.Role:
    role = db.get(models.Role, code)
    if role is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Role not found")
    return role


@router.get("", response_model=list[schemas.RoleOut])
def list_roles(
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("roles.manage")),
):
    roles = (
        db.query(models.Role)
        .order_by(models.Role.sort_order, models.Role.code)
        .all()
    )
    return [_to_out(db, r) for r in roles]


# Declared before /{code} so the literal path wins the route match.
@router.get("/assignable", response_model=list[schemas.RoleOptionOut])
def list_assignable_roles(
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("users.manage")),
):
    """Role options a hospital admin can assign, for pickers in tenant UIs.

    Managing the catalog stays superadmin-only; this is read-only, omits
    platform roles (no tenant may mint a superadmin) and exposes only what a
    dropdown needs.
    """
    roles = (
        db.query(models.Role)
        .filter(models.Role.is_platform.is_(False))
        .order_by(models.Role.sort_order, models.Role.code)
        .all()
    )
    return [
        schemas.RoleOptionOut(
            code=r.code,
            label=r.label,
            home_path=r.home_path,
            self_registerable=r.code in REGISTERABLE_CODES,
        )
        for r in roles
    ]


@router.get("/{code}", response_model=schemas.RoleOut)
def get_role(
    code: str,
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("roles.manage")),
):
    return _to_out(db, _get_or_404(db, code))


@router.post("", response_model=schemas.RoleOut, status_code=status.HTTP_201_CREATED)
def create_role(
    body: schemas.RoleCreate,
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("roles.manage")),
):
    code = body.code.strip().lower()
    if not CODE_PATTERN.match(code):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Code must be 2-32 chars: lowercase letters, digits, - or _, starting with a letter",
        )
    if db.get(models.Role, code) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "A role with that code already exists")

    role = models.Role(
        code=code,
        label=body.label.strip(),
        description=body.description.strip(),
        is_platform=body.is_platform,
        sort_order=body.sort_order,
        home_path=body.home_path.strip(),
    )
    db.add(role)
    # Same transaction: a role must never exist without the permissions the
    # superadmin chose for it, not even briefly.
    db.flush()
    _set_grants(db, code, body.permissions)
    db.commit()
    db.refresh(role)
    return _to_out(db, role)


@router.put("/{code}", response_model=schemas.RoleOut)
def update_role(
    code: str,
    body: schemas.RoleUpdate,
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("roles.manage")),
):
    role = _get_or_404(db, code)
    fields = body.model_dump(exclude_unset=True)
    permissions = fields.pop("permissions", None)
    for field, value in fields.items():
        setattr(role, field, value)
    if permissions is not None:
        _set_grants(db, code, [schemas.PermissionGrant(**g) for g in permissions])
    db.commit()
    db.refresh(role)
    return _to_out(db, role)


@router.delete("/{code}", status_code=status.HTTP_204_NO_CONTENT)
def delete_role(
    code: str,
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("roles.manage")),
):
    role = _get_or_404(db, code)
    if role.code in BUILTIN_CODES:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Built-in roles cannot be deleted",
        )
    # users.role FKs to roles.code, so deleting a role in use would either fail
    # at the constraint or orphan accounts — refuse with a useful message.
    in_use = _user_count(db, role.code)
    if in_use:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Role is assigned to {in_use} user{'s' if in_use != 1 else ''}",
        )
    db.query(models.RolePermission).filter(
        models.RolePermission.role_code == role.code
    ).delete(synchronize_session=False)
    db.delete(role)
    db.commit()
