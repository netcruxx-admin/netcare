"""record that an appointment was moved

The appointments board counts rescheduled visits and the edit dialog can hand a
visit to a different doctor, but the table had nowhere to note either. The flag
is written by the server when the date or time actually changes — clients never
send it, so the count reflects what happened rather than what was claimed.

Revision ID: d72f4e18b593
Revises: c60b8a3f27e5
Create Date: 2026-08-01 11:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd72f4e18b593'
down_revision: Union[str, None] = 'c60b8a3f27e5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Existing rows are not known to have moved, so they start false.
    op.add_column(
        'appointments',
        sa.Column('rescheduled', sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column('appointments', 'rescheduled')
