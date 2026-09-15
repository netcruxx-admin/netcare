"""Configurable injectable/lab bill fields, GST, and per-payment bill snapshot

Revision ID: e4f5a6b7c8d9
Revises: d3e4f5a6b7c8
Create Date: 2026-09-11
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "e4f5a6b7c8d9"
down_revision = "d3e4f5a6b7c8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("hospital_profiles") as batch_op:
        batch_op.add_column(sa.Column("bill_field_config", sa.JSON(), nullable=True))
    with op.batch_alter_table("payments") as batch_op:
        batch_op.add_column(sa.Column("bill_breakdown", sa.JSON(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("payments") as batch_op:
        batch_op.drop_column("bill_breakdown")
    with op.batch_alter_table("hospital_profiles") as batch_op:
        batch_op.drop_column("bill_field_config")
