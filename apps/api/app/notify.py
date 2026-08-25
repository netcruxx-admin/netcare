"""Push notifications via Firebase Cloud Messaging.

Initialised lazily on first use so the rest of the API starts normally when
the service account file is absent (CI, unit tests, fresh dev checkouts).

Usage anywhere in the backend:

    from . import notify
    notify.send(db, user_id="user-abc123", title="Appointment", body="...")
"""

import logging
from pathlib import Path
from typing import Optional

from sqlalchemy.orm import Session

from . import models
from .config import settings

log = logging.getLogger(__name__)

_app = None          # firebase_admin.App, once initialised
_initialized = False # True once we've tried (even if it failed)


def _get_app():
    """Return the Firebase Admin app, initialising it on the first call."""
    global _app, _initialized
    if _initialized:
        return _app

    _initialized = True
    sa_path = Path(__file__).resolve().parent.parent / settings.firebase_service_account

    if not sa_path.exists():
        log.warning(
            "Firebase service account not found at %s — push notifications disabled.",
            sa_path,
        )
        return None

    try:
        import firebase_admin
        from firebase_admin import credentials
        cred = credentials.Certificate(str(sa_path))
        _app = firebase_admin.initialize_app(cred)
        log.info("Firebase Admin initialised from %s", sa_path)
    except Exception:
        log.exception("Failed to initialise Firebase Admin — push notifications disabled.")
        _app = None

    return _app


def send(
    db: Session,
    *,
    user_id: str,
    title: str,
    body: str,
    data: Optional[dict] = None,
) -> int:
    """Send a push notification to every registered device for `user_id`.

    Returns the number of messages successfully sent.  Never raises — a failed
    push must not roll back the database transaction that triggered it.
    """
    app = _get_app()
    if app is None:
        return 0

    tokens = (
        db.query(models.FcmToken)
        .filter(models.FcmToken.user_id == user_id)
        .all()
    )
    if not tokens:
        return 0

    try:
        from firebase_admin import messaging
    except ImportError:
        log.warning("firebase_admin not installed — push notifications disabled.")
        return 0

    sent = 0
    stale: list[str] = []

    for record in tokens:
        msg = messaging.Message(
            notification=messaging.Notification(title=title, body=body),
            data={k: str(v) for k, v in (data or {}).items()},
            token=record.token,
            webpush=messaging.WebpushConfig(
                notification=messaging.WebpushNotification(
                    title=title,
                    body=body,
                    icon="/logo/logo-icon.png",
                ),
            ),
        )
        try:
            messaging.send(msg, app=app)
            sent += 1
        except Exception as exc:
            exc_str = str(exc)
            # Token has been unregistered or is invalid — remove it so we stop
            # trying to deliver to a device that has revoked permission.
            if "registration-token-not-registered" in exc_str or "invalid-argument" in exc_str:
                stale.append(record.id)
            else:
                log.warning("FCM send failed for token %s: %s", record.id, exc)

    if stale:
        db.query(models.FcmToken).filter(models.FcmToken.id.in_(stale)).delete()
        db.commit()
        log.info("Removed %d stale FCM token(s) for user %s", len(stale), user_id)

    return sent
