"""injectable and lab billing: add injection_order_id and test_order_id to payments

Revision ID: c2d3e4f5a6b7
Revises: 8e496818cecd
Create Date: 2026-09-11 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "c2d3e4f5a6b7"
down_revision = "8e496818cecd"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("payments") as batch_op:
        batch_op.add_column(sa.Column("injection_order_id", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("test_order_id", sa.String(), nullable=True))
        batch_op.create_index("ix_payments_injection_order_id", ["injection_order_id"])
        batch_op.create_index("ix_payments_test_order_id", ["test_order_id"])


def downgrade() -> None:
    with op.batch_alter_table("payments") as batch_op:
        batch_op.drop_index("ix_payments_test_order_id")
        batch_op.drop_index("ix_payments_injection_order_id")
        batch_op.drop_column("test_order_id")
        batch_op.drop_column("injection_order_id")
