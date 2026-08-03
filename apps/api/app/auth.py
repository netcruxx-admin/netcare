from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from . import audit, models, sessions
from .config import settings
from .database import get_db

bearer_scheme = HTTPBearer(auto_error=True)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), hashed.encode())
    except ValueError:
        return False


def create_token(
    user_id: str, hospital_id: str | None, role: str, session_id: str
) -> str:
    """Mint a short-lived access token bound to a session.

    `sid` is what makes the token revocable. Without it a JWT is valid until it
    expires no matter what happens to the person holding it; with it, every
    request re-checks a row the server can write to. See sessions.py.
    """
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "sid": session_id,
        # The tenant is embedded so it travels with the token, but the user row
        # (loaded in get_current_user) stays the source of truth for authz.
        "hospitalId": hospital_id,
        "role": role,
        "iat": now,
        "exp": now + timedelta(minutes=settings.access_token_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> models.User:
    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
        )
        user_id = payload.get("sub")
        session_id = payload.get("sid")
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    # The signature only proves the token was minted by us; it says nothing
    # about whether the sign-in behind it is still wanted. That question is a
    # row, so it can be answered "no" the instant someone is dismissed.
    #
    # A token with no `sid` predates this check. Rejected rather than trusted:
    # accepting it would leave exactly the unrevocable credential this exists to
    # remove, and the cost is that sessions issued before the upgrade need one
    # fresh sign-in.
    if not session_id or sessions.load_live(db, session_id) is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session has ended. Please sign in again.",
        )

    user = db.get(models.User, user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found"
        )
    # Every authenticated request passes through here, so this is the one place
    # the audit trail needs to learn who is calling — no router takes part.
    audit.record_actor(user)
    return user


def get_current_session(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> models.Session:
    """The session behind the caller's access token.

    A separate dependency rather than something bolted onto the user object,
    because only a handful of endpoints need it — signing out of *this* device,
    and changing your own password without signing yourself out. Everything else
    wants the user and should not have to know sessions exist.
    """
    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
        )
        session_id = payload.get("sid")
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    session = sessions.load_live(db, session_id) if session_id else None
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session has ended. Please sign in again.",
        )
    return session


def require_role(*roles: str):
    """Tenant-role guard. A platform superadmin passes through every tenant-role
    check (they operate across all tenants, targeting one via X-Hospital-Id)."""

    def dependency(user: models.User = Depends(get_current_user)) -> models.User:
        if user.role == "superadmin":
            return user
        if user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        return user

    return dependency


def require_platform_role(user: models.User = Depends(get_current_user)) -> models.User:
    """Guard for platform-only endpoints (hospital lifecycle/config). Only a
    superadmin may pass — no tenant admin can onboard or reconfigure hospitals."""
    if user.role != "superadmin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Superadmin access required",
        )
    return user
