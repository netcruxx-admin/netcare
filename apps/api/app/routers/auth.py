from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

import hashlib
import logging
import secrets

log = logging.getLogger(__name__)
from datetime import datetime, timedelta, timezone

from .. import audit, consent as consent_lib, email as mailer, models, schemas, sessions
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
        must_change_password=bool(user.must_change_password),
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
            allergies=body.allergies or "",
            chronic_diseases=body.chronic_diseases or "",
            emergency_contact=body.emergency_contact or "",
            emergency_phone=body.emergency_phone or "",
            insurance_provider=body.insurance_provider or "",
            insurance_number=body.insurance_number or "",
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

    if user is None:
        audit.record_action("login_failed")
        audit.record_subject("user", "", detail=body.email)
        if tenant_id:
            audit.record_tenant(tenant_id)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No account found with this email address.",
        )

    if not verify_password(body.password, user.password):
        # Failed sign-ins are the trail's early-warning signal — a burst of them
        # against one account is what a breach looks like before it succeeds.
        # The email is recorded because that is what was tried; the password
        # never is, here or anywhere else in the trail.
        audit.record_action("login_failed")
        audit.record_subject("user", user.id, detail=body.email)
        if tenant_id:
            audit.record_tenant(tenant_id)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect password. Please try again.",
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


@router.post("/change-password", response_model=schemas.AuthResponse)
def change_password(
    body: schemas.ChangePasswordRequest,
    request: Request,
    user: models.User = Depends(get_current_user),
    session: models.Session = Depends(get_current_session),
    db: Session = Depends(get_db),
):
    """Change your own password.

    Guarded by `get_current_user` alone, deliberately: it must stay reachable by
    someone who is mid-forced-change and therefore refused by every
    permission-guarded endpoint. That is the whole point of the exception.

    The current password is required even though the caller is authenticated —
    a token left behind on a shared machine would otherwise be enough to lock
    the real owner out of their own account.

    Every *other* session is ended. A password change is what someone does when
    they think their account is compromised, so leaving the attacker's session
    running would defeat it. The caller's own session survives so they are not
    signed out by the act of securing themselves.
    """
    if not verify_password(body.current_password, user.password):
        audit.record_action("password_change_failed")
        audit.record_subject("user", user.id)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Your current password is not correct.",
        )

    if verify_password(body.new_password, user.password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The new password must be different from the current one.",
        )

    user.password = hash_password(body.new_password)
    # Cleared here rather than by the reset: this is the moment the password
    # stops being one somebody else knows.
    user.must_change_password = False
    revoked = sessions.revoke_all_for_user(
        db,
        user.id,
        reason=sessions.REVOKED_PASSWORD_CHANGE,
        except_session_id=session.id,
    )
    db.commit()
    db.refresh(user)

    audit.record_action("password_changed")
    audit.record_subject("user", user.id, detail=f"{revoked} other session(s) ended")
    return _build_response(db, user, session=session, refresh_token=None)


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


# ---------------------------------------------------------------------------
# Forgot / reset password
# ---------------------------------------------------------------------------

_RESET_TOKEN_TTL_MINUTES = 60


def _hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def _frontend_base_url(request: Request) -> str:
    """Return the base URL the browser was actually on when it made this request.

    Priority:
    1. X-Frontend-Origin — set by the Next.js client to window.location.origin,
       so it always reflects the browser's tab URL (e.g. http://sunrise.localhost:3000).
    2. X-Forwarded-Proto + X-Forwarded-Host — set by nginx / Cloudflare in prod.
    3. Fallback to APP_BASE_URL from settings.

    The API itself runs on :8000, so request.url.host is always localhost:8000
    and must NOT be used.
    """
    origin = request.headers.get("x-frontend-origin", "").strip()
    if origin:
        return origin.rstrip("/")

    proto = request.headers.get("x-forwarded-proto", "").strip()
    host  = request.headers.get("x-forwarded-host", "").strip()
    if proto and host:
        return f"{proto}://{host}"

    # Last resort: non-browser callers (e.g. curl / tests) won't send this
    # header, so fall back to localhost dev default.
    return "http://localhost:3000"


@router.post("/forgot-password", status_code=status.HTTP_200_OK)
def forgot_password(
    body: schemas.ForgotPasswordRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    tenant_id: str = Depends(resolve_public_tenant),
):
    """Request a password-reset link.

    Returns 404 when the email is not registered so the user gets immediate
    feedback instead of wondering whether they mistyped.  This is an internal
    HMS used by known staff and patients — the privacy trade-off of confirming
    an address exists is acceptable here.

    The reset link is built from the *request's own host* so an email sent from
    sunrise.netcare.co.in always links back to that hospital's subdomain, not
    the platform root.
    """
    ip = _client_ip(request)
    _throttle_login(db, body.email, ip)  # re-uses login throttle keyed on IP

    # Look up user scoped to this tenant.  Superadmin (no hospital) is excluded
    # here — the forgot-password page is hidden on the platform root anyway.
    user = (
        db.query(models.User)
        .filter(models.User.hospital_id == tenant_id, models.User.email == body.email)
        .first()
    )

    audit.record_action("forgot_password_requested")
    if tenant_id:
        audit.record_tenant(tenant_id)

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No account found with this email address.",
        )

    audit.record_subject("user", user.id, detail=body.email)

    # Invalidate any still-live tokens for this user so only the newest link
    # works.  A user who clicks "resend" gets a clean slate.
    now = datetime.now(timezone.utc)
    (
        db.query(models.PasswordResetToken)
        .filter(
            models.PasswordResetToken.user_id == user.id,
            models.PasswordResetToken.used_at.is_(None),
        )
        .update({"used_at": now.isoformat()})
    )

    raw_token = secrets.token_urlsafe(32)
    expires_at = (now + timedelta(minutes=_RESET_TOKEN_TTL_MINUTES)).isoformat()

    db.add(
        models.PasswordResetToken(
            id=new_id("prt"),
            hospital_id=user.hospital_id,
            user_id=user.id,
            token_hash=_hash_token(raw_token),
            expires_at=expires_at,
            used_at=None,
            created_at=now.isoformat(),
        )
    )
    db.commit()

    # Build the link from the browser's actual origin — so the reset page opens
    # on the same hospital subdomain the request came from, not the API host.
    base_url = _frontend_base_url(request)
    reset_url = f"{base_url}/reset-password?token={raw_token}"

    hospital_name = "NetCare"
    if user.hospital_id:
        hospital = db.get(models.Hospital, user.hospital_id)
        if hospital:
            hospital_name = hospital.name

    def _send_email():
        try:
            mailer.send_password_reset(user.email, reset_url, hospital_name)
        except Exception:
            log.exception("Password reset email failed for %s", user.email)

    # Send in the background so the API responds immediately — SMTP can be slow
    # or temporarily unreachable without making the user wait.
    background_tasks.add_task(_send_email)

    return {"message": "If that email is registered, you will receive a reset link shortly."}


@router.post("/reset-password", status_code=status.HTTP_200_OK)
def reset_password(
    body: schemas.ResetPasswordRequest,
    db: Session = Depends(get_db),
):
    """Consume a password-reset token and set a new password.

    Every failure returns the same generic 400 — distinguishing expired from
    used from never-existed would tell someone holding a stolen token exactly
    what they have.
    """
    _invalid = HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="This reset link is invalid or has expired. Please request a new one.",
    )

    token_hash = _hash_token(body.token)
    record = (
        db.query(models.PasswordResetToken)
        .filter(models.PasswordResetToken.token_hash == token_hash)
        .first()
    )

    if record is None:
        raise _invalid

    now = datetime.now(timezone.utc)

    if record.used_at is not None:
        raise _invalid

    expires = datetime.fromisoformat(record.expires_at)
    # Make expires timezone-aware if stored without offset (defensive).
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if now > expires:
        raise _invalid

    user = db.get(models.User, record.user_id)
    if user is None:
        raise _invalid

    # Write the new password and mark the token consumed in one commit so
    # there is no window where the token is live but the password is already
    # changed (or vice-versa).
    user.password = hash_password(body.new_password)
    record.used_at = now.isoformat()

    # Revoke every live session: whoever held the old password is now locked
    # out, which is exactly what a password reset is for.
    sessions.revoke_all_for_user(db, user.id, reason=sessions.REVOKED_LOGOUT_ALL)

    db.commit()

    audit.record_action("password_reset_completed")
    audit.record_subject("user", user.id)
    if user.hospital_id:
        audit.record_tenant(user.hospital_id)

    return {"message": "Password updated successfully. Please sign in with your new password."}
