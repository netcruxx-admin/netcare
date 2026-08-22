"""link a medication order back to the prescription it came from

A doctor writing a prescription produced something the pharmacist could look at
but not act on: nothing connected `prescriptions` to `medication_orders`, and
the pharmacist's prescriptions screen was a read-only table. To get a
prescription dispensed, someone had to retype the drug, dose and frequency as a
new medication order.

This column is the link. With it the pharmacist can send a prescription to the
dispense queue in one action, and the queue can refuse to take the same
prescription twice.

Also widens two grants that the pharmacy screens assumed but nobody held:

  admin      inventory.read     /dashboard/inventory already listed admin in
                                its route table, but admin held no inventory
                                grant, so the nav item was filtered out and the
                                URL redirected. Read only — restocking stays
                                with the pharmacist.
  superadmin medicines.manage   A platform user supporting a tenant could not
                                correct a catalogue entry.

Revision ID: a4d9e21b6c37
Revises: f3c81a05d7b2
Create Date: 2026-08-22 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a4d9e21b6c37'
down_revision: Union[str, None] = 'f3c81a05d7b2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

GRANTS = [
    ("admin", "inventory.read", "all"),
    ("superadmin", "medicines.manage", None),
]


def upgrade() -> None:
    op.add_column(
        "medication_orders",
        sa.Column("prescription_id", sa.String(), nullable=True),
    )
    op.create_index(
        "ix_medication_orders_prescription_id",
        "medication_orders",
        ["prescription_id"],
    )
    conn = op.get_bind()
    for role, code, scope in GRANTS:
        conn.execute(
            sa.text(
                "INSERT INTO role_permissions (role_code, permission_code, scope) "
                "VALUES (:role, :code, :scope) ON CONFLICT DO NOTHING"
            ),
            {"role": role, "code": code, "scope": scope},
        )


def downgrade() -> None:
    conn = op.get_bind()
    for role, code, _scope in GRANTS:
        conn.execute(
            sa.text(
                "DELETE FROM role_permissions "
                "WHERE role_code = :role AND permission_code = :code"
            ),
            {"role": role, "code": code},
        )
    op.drop_index("ix_medication_orders_prescription_id", table_name="medication_orders")
    op.drop_column("medication_orders", "prescription_id")
