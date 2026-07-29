"""Seed only the platform superadmin.

Idempotent: skips if the superadmin user already exists."""

from sqlalchemy.orm import Session

from . import models
from .auth import hash_password


def seed_database(db: Session) -> None:
    if db.query(models.User).filter(models.User.email == "superadmin@platform.com").first():
        return

    db.add(
        models.User(
            id="user-superadmin",
            hospital_id=None,
            email="superadmin@platform.com",
            password=hash_password("password123"),
            name="Platform Superadmin",
            role="superadmin",
            created_at=__import__("datetime").datetime.utcnow().isoformat(),
        )
    )
    db.commit()
