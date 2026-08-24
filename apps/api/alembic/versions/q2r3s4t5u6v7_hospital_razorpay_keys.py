"""add razorpay_key_id and razorpay_key_secret to hospital_profiles

Each hospital can connect their own Razorpay account so payments go directly
to the hospital rather than to the platform.  Both columns are nullable:
hospitals that have not configured their own gateway fall back to the
platform-level keys (or get a 503 if those are also absent).

Revision ID: q2r3s4t5u6v7
Revises: p1q2r3s4t5u6
Create Date: 2026-08-22 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "q2r3s4t5u6v7"
down_revision: Union[str, None] = "p1q2r3s4t5u6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "hospital_profiles",
        sa.Column("razorpay_key_id", sa.String(), nullable=True),
    )
    op.add_column(
        "hospital_profiles",
        sa.Column("razorpay_key_secret", sa.String(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("hospital_profiles", "razorpay_key_secret")
    op.drop_column("hospital_profiles", "razorpay_key_id")
