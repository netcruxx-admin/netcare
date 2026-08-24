"""pharmacy billing: make appointment_id nullable, add payment_type and medication_order_id

Revision ID: r3s4t5u6v7w8
Revises: q2r3s4t5u6v7
Create Date: 2026-08-22 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "r3s4t5u6v7w8"
down_revision = "q2r3s4t5u6v7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Make appointment_id nullable so pharmacy/lab payments don't require one.
    with op.batch_alter_table("payments") as batch_op:
        batch_op.alter_column("appointment_id", nullable=True)
        batch_op.add_column(sa.Column("payment_type", sa.String(), nullable=True, server_default="consultation"))
        batch_op.add_column(sa.Column("medication_order_id", sa.String(), nullable=True))
        batch_op.create_index("ix_payments_medication_order_id", ["medication_order_id"])

    # Backfill payment_type for existing rows (all are consultation payments).
    op.execute("UPDATE payments SET payment_type = 'consultation' WHERE payment_type IS NULL")


def downgrade() -> None:
    with op.batch_alter_table("payments") as batch_op:
        batch_op.drop_index("ix_payments_medication_order_id")
        batch_op.drop_column("medication_order_id")
        batch_op.drop_column("payment_type")
        # Restore NOT NULL — this will fail if any pharmacy payments exist.
        batch_op.alter_column("appointment_id", nullable=False)
