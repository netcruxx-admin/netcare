"""cascade tenant deletes

DELETE /hospitals/{id} has never worked on a hospital that was actually
provisioned. Every tenant table's `hospital_id` foreign key was created with the
default ON DELETE NO ACTION, and provisioning always writes departments and a
first admin, so the delete failed on a foreign key violation the moment there
was anything to delete — the endpoint only succeeded on a hospital that had been
manually emptied first.

Recreating each constraint with ON DELETE CASCADE makes the endpoint mean what
it says. Cascade rather than SET NULL: a tenant-owned row with no tenant is
unreachable by `scoped()` and invisible to every screen, so leaving it behind
would not preserve anything — it would only make the row count lie.

`audit_logs` is deliberately untouched. It carries no foreign key on purpose
(see f7a3c02e8d41): the trail has to outlive the rows it describes, or deleting
a hospital would erase the evidence of who read its records.

Revision ID: d1a4f8c62b93
Revises: c9d3e1f74b28
Create Date: 2026-08-03 12:30:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'd1a4f8c62b93'
down_revision: Union[str, None] = 'c9d3e1f74b28'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Every table whose hospital_id FK predates this migration. The four
# hospital_* tables added in c9d3e1f74b28 already cascade and are absent here.
TENANT_TABLES = [
    "anc_visits",
    "appointments",
    "babies",
    "consents",
    "departments",
    "doctors",
    "growth_measurements",
    "immunizations",
    "lab_tests",
    "medical_records",
    "medicines",
    "patients",
    "payments",
    "pregnancy_records",
    "prescriptions",
    "schedule_blocks",
    "test_orders",
    "test_results",
    "users",
    "video_slots",
    "vitals",
]


def _constraint(table: str) -> str:
    # Postgres' default naming for a single-column FK, which is what every one
    # of these was created with.
    return f"{table}_hospital_id_fkey"


def upgrade() -> None:
    for table in TENANT_TABLES:
        op.drop_constraint(_constraint(table), table, type_="foreignkey")
        op.create_foreign_key(
            _constraint(table),
            table,
            "hospitals",
            ["hospital_id"],
            ["id"],
            ondelete="CASCADE",
        )


def downgrade() -> None:
    for table in TENANT_TABLES:
        op.drop_constraint(_constraint(table), table, type_="foreignkey")
        op.create_foreign_key(
            _constraint(table), table, "hospitals", ["hospital_id"], ["id"]
        )
