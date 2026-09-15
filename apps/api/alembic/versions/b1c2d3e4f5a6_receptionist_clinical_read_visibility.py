"""grant receptionist read-only clinical visibility

A receptionist can open an appointment (appointments.read) but every section
below the header needs its own read permission — vitals.read,
medical_records.read, prescriptions.read, lab_orders.read, lab_reports.read —
none of which c6d7e8f9a0b1's grant list included. Each of those list calls
403s, RTK Query quietly defaults the result to an empty list, and every
section's own `if (!canManage && empty) return null` guard then hides itself
with no error shown — so the page reads as broken rather than as "nothing
recorded yet", even when the receptionist is entitled to be there at all.

Scope `all` for the same reason as e5f6a7b8c9d0's admin grant: a front desk
account works across the whole hospital, not a caseload of its own, and there
is no "own" reading to scope this to. `canManage` on these sections stays
false for receptionist regardless — this is read visibility only, not a
write grant; adding, editing or deleting vitals/prescriptions/notes/orders
still belongs to admin and the owning doctor.

Revision ID: b1c2d3e4f5a6
Revises: 4a65b6ac5037
Create Date: 2026-09-16 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b1c2d3e4f5a6"
down_revision: Union[str, None] = "4a65b6ac5037"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_PERMISSION_CODES = [
    "vitals.read",
    "medical_records.read",
    "prescriptions.read",
    "lab_orders.read",
    "lab_reports.read",
]

_GRANTS = [
    {"role_code": "receptionist", "permission_code": code, "scope": "all"}
    for code in _PERMISSION_CODES
]


def upgrade() -> None:
    role_permissions = sa.table(
        "role_permissions",
        sa.column("role_code", sa.String),
        sa.column("permission_code", sa.String),
        sa.column("scope", sa.String),
    )
    op.bulk_insert(role_permissions, _GRANTS)


def downgrade() -> None:
    role_permissions = sa.table(
        "role_permissions",
        sa.column("role_code", sa.String),
        sa.column("permission_code", sa.String),
    )
    op.execute(
        role_permissions.delete().where(
            sa.and_(
                role_permissions.c.role_code == "receptionist",
                role_permissions.c.permission_code.in_(_PERMISSION_CODES),
            )
        )
    )
