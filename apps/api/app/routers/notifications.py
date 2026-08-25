"""FCM token registration.

A device registers its FCM token here after obtaining permission from the
browser.  The token is upserted so re-registering after a token rotation
(Firebase rotates them periodically) never creates duplicates.
"""
from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import get_current_user
from ..database import get_db
from ..utils import new_id, now_iso

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.post("/token", status_code=status.HTTP_204_NO_CONTENT)
def register_token(
    body: schemas.FcmTokenRegister,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """Save or refresh an FCM device token for the signed-in user.

    Upserts on the token value: if this exact token is already registered
    (e.g. the page reloaded), the timestamp is refreshed and nothing else
    changes.  If it is new, a row is inserted — up to one per physical device.
    """
    existing = (
        db.query(models.FcmToken)
        .filter(models.FcmToken.token == body.token)
        .first()
    )
    now = now_iso()
    if existing:
        existing.updated_at = now
        # Re-associate with the current user in case a different user signed in
        # on the same device.
        existing.user_id = user.id
    else:
        db.add(
            models.FcmToken(
                id=new_id("fcm"),
                user_id=user.id,
                token=body.token,
                device_label=body.device_label or "",
                created_at=now,
                updated_at=now,
            )
        )
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/token", status_code=status.HTTP_204_NO_CONTENT)
def unregister_token(
    body: schemas.FcmTokenRegister,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """Remove a token when the user signs out so they stop receiving pushes."""
    db.query(models.FcmToken).filter(
        models.FcmToken.token == body.token,
        models.FcmToken.user_id == user.id,
    ).delete()
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
