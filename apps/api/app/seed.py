"""Seed only the platform superadmin.

Bootstrap, not configuration. It exists so a fresh database has one account that
can onboard the first hospital; everything after that is done through the API.
"""

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from . import models
from .auth import hash_password
from .config import settings

# Fixed, because the row is a singleton: there is exactly one bootstrap account
# and it is addressable without a lookup.
SUPERADMIN_ID = "user-superadmin"


def seed_database(db: Session) -> None:
    """Create the platform superadmin if it is not there yet.

    Keyed on the primary key rather than the email. Those came apart the moment
    someone changed `SUPERADMIN_EMAIL` on a running deployment: the lookup found
    no user with the new address, the insert reused the fixed id, and startup
    died on a duplicate-key violation — on every boot, until the env var was put
    back. A seeder that bricks the app when an operator rotates a credential is
    worse than no seeder.

    An address change is honoured, because an operator who edits that variable
    means it. The password deliberately is not: re-applying it on every boot
    would make the env var a standing backdoor and would silently undo a
    password the superadmin had since chosen for themselves. After first boot,
    the password is changed through /auth/change-password like anyone else's.
    """
    existing = db.get(models.User, SUPERADMIN_ID)
    if existing is not None:
        if existing.email != settings.superadmin_email:
            existing.email = settings.superadmin_email
            db.commit()
        return

    # A superadmin created under a different id (an older seed, a manual insert)
    # still counts — minting a second one would give the platform two owners.
    if (
        db.query(models.User)
        .filter(models.User.email == settings.superadmin_email)
        .first()
        is not None
    ):
        return

    db.add(
        models.User(
            id=SUPERADMIN_ID,
            hospital_id=None,
            email=settings.superadmin_email,
            password=hash_password(settings.superadmin_password),
            name="Platform Superadmin",
            role="superadmin",
            created_at=datetime.now(timezone.utc).isoformat(),
        )
    )
    db.commit()
