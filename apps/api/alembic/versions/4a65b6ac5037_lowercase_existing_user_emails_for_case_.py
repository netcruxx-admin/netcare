"""lowercase existing user emails for case-insensitive login

Every write path now normalises email to lowercase (see identity.py's
normalise_email and its callers), so two accounts can never again differ only
by case going forward. This backfills the rows written before that: without
it, an account created as "User@Example.com" would still fail to match a
lowercase login attempt even though the app now believes email matching is
case-insensitive everywhere.

Refuses rather than guessing if lowercasing would collide two existing
accounts (one hospital's "doc@x.com" and "Doc@X.com", say) — that is a data
conflict a migration should not resolve unsupervised, so it is surfaced for a
human to fix instead of silently merging or blanking one of the two.

Revision ID: 4a65b6ac5037
Revises: ea3fa8a0fd4e
Create Date: 2026-09-14 12:25:43.929134

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4a65b6ac5037'
down_revision: Union[str, None] = 'ea3fa8a0fd4e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()

    # Mirrors the scoping of uq_users_tenant_email / uq_users_platform_email:
    # grouped by hospital_id (NULL groups with NULL, i.e. every platform
    # account together) and the lowercased email, excluding the blank ones
    # those indexes already exclude.
    collisions = conn.execute(sa.text("""
        SELECT hospital_id, lower(trim(email)) AS email, array_agg(id ORDER BY id) AS ids
        FROM users
        WHERE trim(email) <> ''
        GROUP BY hospital_id, lower(trim(email))
        HAVING count(*) > 1
    """)).fetchall()
    if collisions:
        detail = "; ".join(
            f"{row.email!r} in {'hospital ' + row.hospital_id if row.hospital_id else 'the platform'}: "
            f"users {row.ids}"
            for row in collisions
        )
        raise RuntimeError(
            "Cannot lowercase user emails — these accounts already differ only "
            f"by case and would collide once normalised: {detail}. Resolve each "
            "pair by hand (change one address or merge the accounts), then "
            "re-run this migration."
        )

    conn.execute(sa.text("""
        UPDATE users
        SET email = lower(trim(email))
        WHERE email <> lower(trim(email))
    """))


def downgrade() -> None:
    # Original casing is discarded, not recorded anywhere — there is nothing
    # to restore. Left as a no-op rather than raising, so a downgrade chain
    # that passes through this revision for an unrelated schema change further
    # up does not die here over data that was never coming back either way.
    pass
