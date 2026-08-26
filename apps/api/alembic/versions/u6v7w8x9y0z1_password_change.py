"""let people change their own password, and staff reset someone else's

Until now nobody could change their own password. Not a patient, not a
clinician, not an admin for themselves — the only path was one admin editing
another user's row through PUT /users/{id}. A person who forgot their password
had no recovery at all, and a person who suspected their account was compromised
had no way to act on it.

`must_change_password` marks a password somebody else chose: an admin reset, or
the one a staff account was provisioned with. Until the holder replaces it,
every permission-guarded endpoint refuses — an action taken under a password the
front desk also knows cannot be honestly attributed to its owner in the audit
trail.

Existing rows default to false. Backfilling them to true would lock every
current user out of a running system to fix a risk they are already living with;
the flag earns its keep from here forward.

Revision ID: u6v7w8x9y0z1
Revises: t5u6v7w8x9y0
Create Date: 2026-08-25 10:15:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'u6v7w8x9y0z1'
down_revision: Union[str, None] = 't5u6v7w8x9y0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'users',
        sa.Column(
            'must_change_password',
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )


def downgrade() -> None:
    op.drop_column('users', 'must_change_password')
