from typing import Optional

"""Staff provisioning — creating accounts for people who work at a hospital.

Split out from /auth/register deliberately. Registration is public, so it may
only ever create patients; anyone able to sign themselves up as a doctor or
nurse would inherit that role's access to other people's records. Staff accounts
are therefore created here, by someone who already holds `users.manage`.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import get_current_user, hash_password
from .. import sessions
from ..authz import SCOPE_OWN, require_permission
from ..database import get_db
from ..tenancy import get_tenant_id, scoped
from ..utils import ListQuery, list_params, new_id, now_iso, paginate, text_search

router = APIRouter(prefix="/users", tags=["users"])


def _get_or_404(db: Session, user_id: str, tenant_id: str) -> models.User:
    user = (
        scoped(db, models.User, tenant_id).filter(models.User.id == user_id).first()
    )
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    return user


@router.get("", response_model=list[schemas.UserOut])
def list_users(
    response: Response,
    role: Optional[str] = Query(default=None),
    params: ListQuery = Depends(list_params),
    db: Session = Depends(get_db),
    scope: str = Depends(require_permission("users.read")),
    tenant_id: str = Depends(get_tenant_id),
):
    query = scoped(db, models.User, tenant_id)
    if scope == SCOPE_OWN:
        # Nobody is granted this today, but the narrow reading must be the safe
        # one if someone ever is.
        query = query.filter(models.User.id == models.User.id)
    if role:
        query = query.filter(models.User.role == role)
    query = text_search(
        query, [models.User.name, models.User.email, models.User.phone], params.q
    )
    query = query.order_by(models.User.name, models.User.id)
    return paginate(query, response, params.limit, params.offset).all()


@router.put("/me", response_model=schemas.UserOut)
def update_own_account(
    body: schemas.OwnAccountUpdate,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
    _: str = Depends(require_permission("profile.manage")),
    tenant_id: str = Depends(get_tenant_id),
):
    """Edit your own name, email and phone.

    Separate from PUT /users/{id} because that one is staff administration and
    requires `users.manage`; everyone needs to be able to correct their own
    contact details. Role and password are deliberately not editable here — a
    self-service endpoint must never be a route to changing your own access.
    """
    if body.email and body.email != user.email:
        clash = (
            scoped(db, models.User, tenant_id)
            .filter(models.User.email == body.email, models.User.id != user.id)
            .first()
        )
        if clash:
            raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(user, field, value)
    db.commit()
    db.refresh(user)
    return schemas.UserOut.model_validate(user)


@router.post("", response_model=schemas.UserOut, status_code=status.HTTP_201_CREATED)
def create_user(
    body: schemas.UserCreate,
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("users.manage")),
    tenant_id: str = Depends(get_tenant_id),
):
    role = db.get(models.Role, body.role)
    if role is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Unknown role")
    if role.is_platform:
        # Platform roles belong to no hospital; minting one inside a tenant would
        # hand a hospital admin control of the whole platform.
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "Platform roles cannot be assigned to a hospital user"
        )

    existing = (
        scoped(db, models.User, tenant_id)
        .filter(models.User.email == body.email)
        .first()
    )
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")

    user = models.User(
        id=new_id("user"),
        hospital_id=tenant_id,
        email=body.email,
        password=hash_password(body.password),
        name=body.name,
        phone=body.phone,
        role=body.role,
        created_at=now_iso(),
    )
    db.add(user)

    # Roles with a clinical profile get the linked row created alongside, so the
    # account is usable immediately.
    if body.role == "patient":
        db.add(
            models.Patient(
                id=new_id("pat"),
                hospital_id=tenant_id,
                user_id=user.id,
                phone=body.phone,
                gender=body.gender or "",
                blood_group=body.blood_group or "",
                date_of_birth=body.date_of_birth or "",
                documents=[],
            )
        )
    elif body.role == "doctor":
        db.add(
            models.Doctor(
                id=new_id("doc"),
                hospital_id=tenant_id,
                user_id=user.id,
                specialization=body.specialization or "",
                qualification=body.qualification or "",
                experience_years=body.experience_years or 0,
                available_slots=[],
                # Created by hospital staff, so the hospital has vouched for them.
                verification_status="verified",
            )
        )

    db.commit()
    db.refresh(user)
    return schemas.UserOut.model_validate(user)


@router.put("/{user_id}", response_model=schemas.UserOut)
def update_user(
    user_id: str,
    body: schemas.UserUpdate,
    db: Session = Depends(get_db),
    _: str = Depends(require_permission("users.manage")),
    tenant_id: str = Depends(get_tenant_id),
):
    user = _get_or_404(db, user_id, tenant_id)
    fields = body.model_dump(exclude_unset=True)

    role = fields.get("role")
    if role is not None:
        target = db.get(models.Role, role)
        if target is None:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Unknown role")
        if target.is_platform:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                "Platform roles cannot be assigned to a hospital user",
            )

    password = fields.pop("password", None)
    if password:
        fields["password"] = hash_password(password)

    if "email" in fields and fields["email"] != user.email:
        clash = (
            scoped(db, models.User, tenant_id)
            .filter(models.User.email == fields["email"], models.User.id != user_id)
            .first()
        )
        if clash:
            raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")

    for field, value in fields.items():
        setattr(user, field, value)

    # Changing what someone is, or the password that proves they are them, has
    # to reach the sessions they already hold. Permissions were always resolved
    # per request so a demotion took effect immediately; identity was not, and
    # without this a demoted user keeps their old access until their refresh
    # window lapses. A password reset carries the same weight — it is what an
    # admin does *because* an account is suspected compromised, so leaving the
    # attacker's session alive would defeat the point.
    if role is not None or password:
        sessions.revoke_all_for_user(
            db,
            user.id,
            reason=sessions.REVOKED_ROLE_CHANGE if role is not None else sessions.REVOKED_PASSWORD_CHANGE,
        )

    db.commit()
    db.refresh(user)
    return schemas.UserOut.model_validate(user)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: str,
    db: Session = Depends(get_db),
    actor: models.User = Depends(get_current_user),
    _: str = Depends(require_permission("users.manage")),
    tenant_id: str = Depends(get_tenant_id),
):
    user = _get_or_404(db, user_id, tenant_id)
    # Deleting yourself would leave the session pointing at a missing user.
    if user.id == actor.id:
        raise HTTPException(status.HTTP_409_CONFLICT, "You cannot delete your own account")
    # Cut the sessions before the row goes: get_current_user would reject them
    # anyway once the user is missing, but leaving live rows behind pointing at
    # a deleted account makes the session table lie about who is signed in.
    sessions.revoke_all_for_user(db, user.id, reason=sessions.REVOKED_USER_DELETED)
    # Remove any clinical profile linked to this user so no orphaned rows remain.
    db.query(models.Doctor).filter(models.Doctor.user_id == user_id).delete()
    db.query(models.Patient).filter(models.Patient.user_id == user_id).delete()
    db.delete(user)
    db.commit()
