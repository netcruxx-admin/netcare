from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from datetime import datetime, timedelta, timezone

from .. import audit, consent as consent_lib, models, schemas, sessions
from ..auth import (
    create_token,
    get_current_session,
    get_current_user,
    hash_password,
    verify_password,
)
from ..authz import effective_permissions
from ..config import settings
from ..database import get_db
from ..tenancy import resolve_public_tenant
from ..utils import new_id, now_iso

router = APIRouter(prefix="/auth", tags=["auth"])


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else ""


def _build_response(
    db: Session,
    user: models.User,
    *,
    session: models.Session,
    refresh_token: str | None,
) -> schemas.AuthResponse:
    """The signed-in payload. Always tied to a session — there is no way to mint
    an access token without one, which is what makes every token revocable."""
    patient = None
    if user.role == "patient":
        patient = (
            db.query(models.Patient).filter(models.Patient.user_id == user.id).first()
        )
    role = db.get(models.Role, user.role)
    # Resolved per request rather than stored in the token, so a superadmin
    # changing a role's grants takes effect on the very next call.
    granted = effective_permissions(db, user)
    return schemas.AuthResponse(
        user=schemas.UserOut.model_validate(user),
        patient=schemas.PatientOut.model_validate(patient) if patient else None,
        role=schemas.RoleOptionOut.model_validate(role) if role else None,
        permissions=[
            schemas.PermissionGrant(code=code, scope=scope)
            for code, scope in sorted(granted.items())
        ],
        token=create_token(user.id, user.hospital_id, user.role, session.id),
        refresh_token=refresh_token,
        expires_in=settings.access_token_minutes * 60,
        is_authenticated=True,
    )


def _throttle_login(db: Session, email: str, ip: str) -> None:
    """Refuse the attempt when this address has been failing too often.

    Counted off the audit trail rather than a counter table: every failed
    sign-in is already recorded there with its address and the email tried, so
    the lockout rests on the same evidence an investigator would read, and there
    is no second source of truth to drift.

    Both thresholds are scoped to the source address on purpose. A per-account
    limit that ignored the address would let anyone lock a real user out of
    their own account by failing on their behalf, turning this defence into a
    denial of service.
    """
    if not ip:
        return
    cutoff = (
        datetime.now(timezone.utc)
        - timedelta(minutes=settings.login_failure_window_minutes)
    ).isoformat()
    recent = db.query(models.AuditLog).filter(
        models.AuditLog.action == "login_failed",
        models.AuditLog.created_at > cutoff,
        models.AuditLog.actor_ip == ip,
    )
    per_ip = recent.count()
    if per_ip >= settings.login_max_failures_per_ip:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many failed sign-in attempts. Please try again later.",
            headers={"Retry-After": str(settings.login_failure_window_minutes * 60)},
        )
    per_account = recent.filter(models.AuditLog.detail == email).count()
    if per_account >= settings.login_max_failures_per_account:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many failed sign-in attempts for this account. Please try again later.",
            headers={"Retry-After": str(settings.login_failure_window_minutes * 60)},
        )


@router.post("/register", response_model=schemas.AuthResponse)
def register(
    body: schemas.RegisterRequest,
    request: Request,
    db: Session = Depends(get_db),
    tenant_id: str = Depends(resolve_public_tenant),
):
    # Which hospital this account belongs to is decided by the host the request
    # arrived on, never by the body or a header. If that could not be resolved
    # there is no safe default — guessing would file the account, and every
    # record it goes on to create, under someone else's tenant.
    if not tenant_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not determine which hospital this sign-up belongs to.",
        )

    # Checked before the user row is built, so a sign-up that skipped the notice
    # fails without having created anything. An account cannot exist before
    # there is a lawful basis for the data it is about to hold.
    hospital = db.get(models.Hospital, tenant_id)
    purposes = consent_lib.assert_required_given(db, hospital, body.consents)

    # Email is unique per tenant, so the check is scoped to this hospital.
    existing = (
        db.query(models.User)
        .filter(models.User.hospital_id == tenant_id, models.User.email == body.email)
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Email already registered"
        )

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

    # The moment a person's data enters a hospital. The middleware cannot see
    # which tenant that was — the host decided it, not the path — so this is the
    # one place the trail can learn it.
    audit.record_tenant(tenant_id)
    audit.record_subject("user", user.id, detail=body.email)

    # RegisterRole is patient-only: a public endpoint must not be able to mint an
    # account that can read other people's records. Staff go through POST /users.
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

    # Flushed so the consent recorder can read the date of birth it just wrote.
    # The session is autoflush=False, so without this the minor check would see
    # no patient row and wave an under-18 sign-up straight through.
    db.flush()

    ip = request.headers.get("x-forwarded-for", "").split(",")[0].strip() or (
        request.client.host if request.client else ""
    )
    for purpose in purposes:
        # Raises if the subject is under 18 and no guardian was named — which
        # rolls back the whole sign-up, user row included. That is deliberate:
        # a minor's account with no verifiable parental consent behind it is the
        # thing DPDP s.9 exists to prevent, so it must not be half-created.
        consent_lib.record(
            db,
            tenant_id=tenant_id,
            subject_user_id=user.id,
            purpose=purpose,
            guardian_name=body.guardian_name,
            guardian_relationship=body.guardian_relationship,
            ip=ip,
            user_agent=request.headers.get("user-agent", "")[:256],
        )

    session, refresh_token = sessions.issue(
        db, user, ip=ip, user_agent=request.headers.get("user-agent", "")
    )
    db.commit()
    db.refresh(user)
    return _build_response(db, user, session=session, refresh_token=refresh_token)


@router.post("/login", response_model=schemas.AuthResponse)
def login(
    body: schemas.LoginRequest,
    request: Request,
    db: Session = Depends(get_db),
    tenant_id: str = Depends(resolve_public_tenant),
):
    ip = _client_ip(request)
    # Before the password is even checked: a throttled attempt must not be a
    # free oracle for whether the account exists.
    _throttle_login(db, body.email, ip)
    # Prefer a user in the resolved tenant; fall back to a platform superadmin
    # (who belongs to no hospital and can sign in from any origin).
    user = (
        db.query(models.User)
        .filter(models.User.hospital_id == tenant_id, models.User.email == body.email)
        .first()
    )
    if user is None:
        user = (
            db.query(models.User)
            .filter(
                models.User.hospital_id.is_(None),
                models.User.role == "superadmin",
                models.User.email == body.email,
            )
            .first()
        )

    if user is None or not verify_password(body.password, user.password):
        # Failed sign-ins are the trail's early-warning signal — a burst of them
        # against one account is what a breach looks like before it succeeds.
        # The email is recorded because that is what was tried; the password
        # never is, here or anywhere else in the trail.
        audit.record_action("login_failed")
        audit.record_subject("user", user.id if user else "", detail=body.email)
        if tenant_id:
            audit.record_tenant(tenant_id)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    # Block login for users whose hospital has been suspended.
    if user.hospital_id:
        hospital = db.get(models.Hospital, user.hospital_id)
        if hospital and hospital.status == "suspended":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This hospital account has been suspended. Please contact the platform administrator.",
            )

    # A successful sign-in opens the window in which everything else happens, so
    # it is an audit event in its own right. get_current_user cannot record it —
    # login is the one authenticated action that runs without a token.
    audit.record_action("login")
    audit.record_actor(user)
    if user.hospital_id:
        audit.record_tenant(user.hospital_id)

    session, refresh_token = sessions.issue(
        db, user, ip=ip, user_agent=request.headers.get("user-agent", "")
    )
    db.commit()
    return _build_response(db, user, session=session, refresh_token=refresh_token)


@router.post("/refresh", response_model=schemas.AuthResponse)
def refresh(
    body: schemas.RefreshRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """Trade a refresh token for a fresh pair, rotating the session.

    Deliberately not guarded by get_current_user: the whole point is to be
    callable once the access token has expired, which is when the client needs
    it most.

    Every failure is the same 401 with the same wording. Distinguishing expired
    from revoked from never-existed would tell someone holding a stolen token
    exactly what they are holding.
    """
    session, refresh_token, user = sessions.exchange(
        db,
        body.refresh_token,
        ip=_client_ip(request),
        user_agent=request.headers.get("user-agent", ""),
    )
    if session is None or user is None or refresh_token is None:
        db.commit()  # a reuse detection revoked a family; that write must land
        audit.record_action("refresh_failed")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session has ended. Please sign in again.",
        )

    # A sign-in that outlives its hospital's suspension would be a hole straight
    # through the check on /auth/login, so it is re-asked on every renewal.
    if user.hospital_id:
        hospital = db.get(models.Hospital, user.hospital_id)
        if hospital and hospital.status == "suspended":
            sessions.revoke_all_for_user(
                db, user.id, reason=sessions.REVOKED_HOSPITAL_SUSPENDED
            )
            db.commit()
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This hospital account has been suspended. Please contact the platform administrator.",
            )

    audit.record_action("refresh")
    audit.record_actor(user)
    if user.hospital_id:
        audit.record_tenant(user.hospital_id)
    db.commit()
    return _build_response(db, user, session=session, refresh_token=refresh_token)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    session: models.Session = Depends(get_current_session),
    db: Session = Depends(get_db),
):
    """End this session. The access token stops working on the next request."""
    sessions.revoke(db, session.id, reason=sessions.REVOKED_LOGOUT)
    db.commit()
    audit.record_action("logout")
    audit.record_subject("session", session.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/logout-all", status_code=status.HTTP_204_NO_CONTENT)
def logout_all(
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """End every session this person holds, including this one.

    The "my laptop was stolen" button. Deliberately available to anyone signed
    in rather than gated on a permission — the person best placed to know their
    account is compromised is its owner, and making them ask an admin first is
    how a small incident becomes a large one.
    """
    count = sessions.revoke_all_for_user(db, user.id, reason=sessions.REVOKED_LOGOUT_ALL)
    db.commit()
    audit.record_action("logout_all")
    audit.record_subject("user", user.id, detail=f"{count} session(s) ended")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me", response_model=schemas.AuthResponse)
def me(
    user: models.User = Depends(get_current_user),
    session: models.Session = Depends(get_current_session),
    db: Session = Depends(get_db),
):
    """Re-read the caller's identity and permissions.

    Mints a fresh access token off the *existing* session rather than opening a
    new one, so polling this cannot fan out sessions. No refresh token comes
    back: this reports a sign-in, it does not start one.
    """
    return _build_response(db, user, session=session, refresh_token=None)
