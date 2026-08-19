"""Seed only the platform superadmin.

Idempotent: skips if the superadmin user already exists."""

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from . import models
from .auth import hash_password
from .config import settings


def seed_database(db: Session) -> None:
    email = settings.superadmin_email
    if db.query(models.User).filter(models.User.email == email).first():
        return

    db.add(
        models.User(
            id="user-superadmin",
            hospital_id=None,
            email=email,
            password=hash_password(settings.superadmin_password),
            name="Platform Superadmin",
            role="superadmin",
            created_at=datetime.now(timezone.utc).isoformat(),
        )
    )
    db.commit()
