"""Sign-ins the server can end.

The problem this solves: a JWT is a bearer credential that cannot be taken back.
Sign it for seven days and it is good for seven days — after a dismissal, after
a password change, after a laptop is stolen. Permissions were already immune to
this, because authz.py resolves them per request rather than reading them out of
the token. Identity was not.

The shape:

  * The **access token** is a short-lived JWT (minutes) carrying a `sid` claim.
  * The **refresh token** is opaque, long-lived, and stored here as a hash. It is
    the only thing that can mint a new access token.
  * `sid` points at a Session row, checked on every authenticated request. Ending
    a session is a write, so it takes effect on the next call — not whenever the
    token happens to lapse.

Refresh tokens rotate on every use, which turns a stolen one from a quiet
seven-day hold into something that gets *noticed*: the thief and the real client
now hold different halves of a chain, and whichever presents an already-rotated
token reveals the theft. That presentation revokes the whole family rather than
the single token, because by then there is no way to tell which side was the
attacker.

CERT-In and DPDP both want an account takeover to be containable; this is the
mechanism that makes containment possible at all.
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy.orm import Session as DbSession

from . import models
from .config import settings
from .utils import new_id, now_iso

# Reasons a session ends. Recorded on the row so an incident review can tell a
# routine sign-out from a containment action.
REVOKED_LOGOUT = "logout"
REVOKED_LOGOUT_ALL = "logout_all"
REVOKED_PASSWORD_CHANGE = "password_change"
REVOKED_ROLE_CHANGE = "role_change"
REVOKED_USER_DELETED = "user_deleted"
REVOKED_HOSPITAL_SUSPENDED = "hospital_suspended"
REVOKED_REFRESH_REUSE = "refresh_reuse"
REVOKED_SUPERSEDED = "superseded"


def hash_refresh_token(token: str) -> str:
    """SHA-256 of a refresh token.

    Not bcrypt: the input is 384 bits of CSPRNG output, so there is no
    low-entropy guess for a slow hash to frustrate, and paying bcrypt's cost on
    every refresh would be a self-inflicted denial of service. What matters is
    that a database leak yields hashes rather than live sessions, which this
    gives, and that lookup is a constant-time index hit on the hash rather than
    a comparison in Python.
    """
    return hashlib.sha256(token.encode()).hexdigest()


def _refresh_expiry() -> str:
    return (
        datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_days)
    ).isoformat()


def issue(
    db: DbSession,
    user: models.User,
    *,
    family_id: Optional[str] = None,
    ip: str = "",
    user_agent: str = "",
) -> tuple[models.Session, str]:
    """Open a session and return it with the raw refresh token.

    The raw token is returned once and never stored — only its hash lands in the
    table, so this return value is the sole opportunity to hand it to the client.

    `family_id` carries the chain forward on a rotation. Omitted at login, where
    a new sign-in starts its own family and so cannot be revoked by the fallout
    from an unrelated one.
    """
    raw_token = secrets.token_urlsafe(48)
    session = models.Session(
        id=new_id("ses"),
        family_id=family_id or new_id("fam"),
        user_id=user.id,
        hospital_id=user.hospital_id,
        refresh_token_hash=hash_refresh_token(raw_token),
        issued_at=now_iso(),
        expires_at=_refresh_expiry(),
        ip=ip[:64],
        user_agent=user_agent[:256],
    )
    db.add(session)
    return session, raw_token


def is_live(session: models.Session) -> bool:
    """Whether a session may still authenticate a request.

    A rotated session is deliberately *not* live: its access tokens keep working
    until they expire on their own (they are short, and rejecting them mid-flight
    would log a user out every few minutes), but it can no longer be refreshed.
    That is checked separately in `exchange`; here only revocation and expiry
    matter.
    """
    if session.revoked_at:
        return False
    return session.expires_at > now_iso()


def load_live(db: DbSession, session_id: str) -> Optional[models.Session]:
    """The session behind an access token's `sid`, if it is still good."""
    session = db.get(models.Session, session_id)
    if session is None or session.revoked_at:
        return None
    # The refresh window bounds the whole sign-in: once it lapses, an access
    # token minted just before it should not outlive it.
    if session.expires_at <= now_iso():
        return None
    return session


def exchange(
    db: DbSession, raw_token: str, *, ip: str = "", user_agent: str = ""
) -> tuple[Optional[models.Session], Optional[str], Optional[models.User]]:
    """Trade a refresh token for a new one, rotating the session.

    Returns (session, raw_refresh_token, user), or (None, None, None) when the
    token is unusable — expired, revoked, unknown, or replayed. The caller turns
    that into a 401 without saying which, since distinguishing them would tell an
    attacker whether a guessed token ever existed.

    Replay is the interesting case. A token presented after it was already
    exchanged means two parties hold the chain, and there is no way to tell which
    one is the thief — so the whole family goes, forcing a real sign-in that only
    the person with the password can complete.
    """
    presented = hash_refresh_token(raw_token)
    session = (
        db.query(models.Session)
        .filter(models.Session.refresh_token_hash == presented)
        .first()
    )
    if session is None:
        return None, None, None

    if session.rotated_at or session.revoked_at:
        revoke_family(
            db,
            session.family_id,
            reason=REVOKED_REFRESH_REUSE if session.rotated_at else session.revoked_reason,
        )
        return None, None, None

    if session.expires_at <= now_iso():
        return None, None, None

    user = db.get(models.User, session.user_id)
    if user is None:
        # The account went away underneath a live session.
        revoke_family(db, session.family_id, reason=REVOKED_USER_DELETED)
        return None, None, None

    # Claim the rotation with a conditional UPDATE rather than by assigning to
    # the object. The check above is a read, and two refreshes arriving together
    # both pass it — which would mint two live sessions from one token and let a
    # thief racing the real client succeed instead of being detected.
    #
    # `rotated_at IS NULL` in the WHERE is what makes the claim exclusive. Under
    # READ COMMITTED the second transaction blocks on the row lock, then
    # re-evaluates the condition once the first commits, and matches nothing.
    # Zero rows updated therefore means "someone else got here first", which is
    # the same event as a replay and gets the same answer.
    stamp = now_iso()
    claimed = (
        db.query(models.Session)
        .filter(
            models.Session.id == session.id,
            models.Session.rotated_at.is_(None),
        )
        .update(
            {
                models.Session.rotated_at: stamp,
                models.Session.revoked_at: stamp,
                models.Session.revoked_reason: REVOKED_SUPERSEDED,
                models.Session.last_used_at: stamp,
            },
            synchronize_session=False,
        )
    )
    if not claimed:
        revoke_family(db, session.family_id, reason=REVOKED_REFRESH_REUSE)
        return None, None, None

    new_session, new_raw = issue(
        db, user, family_id=session.family_id, ip=ip, user_agent=user_agent
    )
    return new_session, new_raw, user


def revoke(db: DbSession, session_id: str, *, reason: str) -> int:
    """End one session. Returns how many rows changed (0 if already ended)."""
    return (
        db.query(models.Session)
        .filter(
            models.Session.id == session_id,
            models.Session.revoked_at.is_(None),
        )
        .update(
            {
                models.Session.revoked_at: now_iso(),
                models.Session.revoked_reason: reason,
            },
            synchronize_session=False,
        )
    )


def revoke_family(db: DbSession, family_id: str, *, reason: str) -> int:
    """End every session descended from one sign-in."""
    return (
        db.query(models.Session)
        .filter(
            models.Session.family_id == family_id,
            models.Session.revoked_at.is_(None),
        )
        .update(
            {
                models.Session.revoked_at: now_iso(),
                models.Session.revoked_reason: reason,
            },
            synchronize_session=False,
        )
    )


def revoke_all_for_user(
    db: DbSession, user_id: str, *, reason: str, except_session_id: Optional[str] = None
) -> int:
    """End every session a person holds. The dismissal switch.

    `except_session_id` keeps the caller's own session alive, which is what you
    want when someone changes their own password: every *other* device is signed
    out, and they are not signed out of the one they are using to do it.
    """
    query = db.query(models.Session).filter(
        models.Session.user_id == user_id,
        models.Session.revoked_at.is_(None),
    )
    if except_session_id:
        query = query.filter(models.Session.id != except_session_id)
    return query.update(
        {
            models.Session.revoked_at: now_iso(),
            models.Session.revoked_reason: reason,
        },
        synchronize_session=False,
    )


def revoke_all_for_hospital(db: DbSession, hospital_id: str, *, reason: str) -> int:
    """End every session at one hospital — suspension, in one write.

    Login already refuses a suspended hospital, but that only stops *new*
    sign-ins; without this, everyone already inside stays inside until their
    refresh window lapses.
    """
    return (
        db.query(models.Session)
        .filter(
            models.Session.hospital_id == hospital_id,
            models.Session.revoked_at.is_(None),
        )
        .update(
            {
                models.Session.revoked_at: now_iso(),
                models.Session.revoked_reason: reason,
            },
            synchronize_session=False,
        )
    )


def purge_expired(db: DbSession) -> int:
    """Delete sessions whose refresh window has lapsed.

    Safe to delete rather than keep, unlike the audit trail: a lapsed session
    proves nothing that audit_logs does not already record, and the login,
    refresh and logout that bracketed it are all in there with timestamps.
    Not scheduled anywhere — call it from a cron when the table gets large.
    """
    deleted = (
        db.query(models.Session)
        .filter(models.Session.expires_at < now_iso())
        .delete(synchronize_session=False)
    )
    db.commit()
    return deleted
