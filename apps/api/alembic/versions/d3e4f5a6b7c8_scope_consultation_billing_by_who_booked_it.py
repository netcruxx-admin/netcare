"""scope consultation billing by who booked the appointment

Adds `booked_by_user_id` / `booked_by_role` to `appointments` — the fact of
who placed the booking (a patient themselves, a doctor's own follow-up, or a
staff member booking for someone else), computed at booking time and
previously discarded rather than kept.

Narrows the receptionist's `payments.read` grant on the Consultation Billing
report from `all` to a new scope, `booked`: understood by exactly one
endpoint (`get_consultation_billing_summary`), it means "appointments I
booked, plus anyone else's while `payments.read` still reads `all`
everywhere else this permission gates (reprinting a bill, the other billing
tabs) so nothing else about what a receptionist can do changes. Existing
appointments have no `booked_by_user_id` — they are `NULL`, treated as
unattributed and shown to every receptionist rather than hidden.

Admin and pharmacist keep `payments.read: all` — unchanged.

Revision ID: d3e4f5a6b7c8
Revises: c2d3e4f5a6b7
Create Date: 2026-09-11 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "d3e4f5a6b7c8"
down_revision = "c2d3e4f5a6b7"
branch_labels = None
depends_on = None


def _role_permissions() -> sa.TableClause:
    return sa.table(
        "role_permissions",
        sa.column("role_code", sa.String),
        sa.column("permission_code", sa.String),
        sa.column("scope", sa.String),
    )


def upgrade() -> None:
    with op.batch_alter_table("appointments") as batch_op:
        batch_op.add_column(sa.Column("booked_by_user_id", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("booked_by_role", sa.String(), nullable=True))
        batch_op.create_index("ix_appointments_booked_by_user_id", ["booked_by_user_id"])

    role_permissions = _role_permissions()
    op.execute(
        role_permissions.update()
        .where(
            sa.and_(
                role_permissions.c.role_code == "receptionist",
                role_permissions.c.permission_code == "payments.read",
            )
        )
        .values(scope="booked")
    )


def downgrade() -> None:
    role_permissions = _role_permissions()
    op.execute(
        role_permissions.update()
        .where(
            sa.and_(
                role_permissions.c.role_code == "receptionist",
                role_permissions.c.permission_code == "payments.read",
            )
        )
        .values(scope="all")
    )

    with op.batch_alter_table("appointments") as batch_op:
        batch_op.drop_index("ix_appointments_booked_by_user_id")
        batch_op.drop_column("booked_by_role")
        batch_op.drop_column("booked_by_user_id")
