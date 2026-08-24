"""medication_orders.appointment_id: make nullable for direct (no-appointment) orders

Revision ID: s4t5u6v7w8x9
Revises: r3s4t5u6v7w8
Create Date: 2026-08-22 00:01:00.000000
"""
from alembic import op

revision = "s4t5u6v7w8x9"
down_revision = "r3s4t5u6v7w8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("medication_orders") as batch_op:
        batch_op.alter_column("appointment_id", nullable=True)


def downgrade() -> None:
    # Clear any rows without an appointment_id before restoring NOT NULL,
    # otherwise the constraint cannot be re-added.
    op.execute("UPDATE medication_orders SET appointment_id = '' WHERE appointment_id IS NULL")
    with op.batch_alter_table("medication_orders") as batch_op:
        batch_op.alter_column("appointment_id", nullable=False)
