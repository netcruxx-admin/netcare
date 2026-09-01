"""grant payments.read to pharmacist

Pharmacists bill patients directly at the counter. Without payments.read they
could dispense and collect money but had no way to view today's billing summary
or print an invoice. This grant gives them read-only visibility of pharmacy
payment records (scope: all — they process all orders in the queue, not just
their own).

Revision ID: z1a2b3c4d5e6
Revises: y0z1a2b3c4d5
Create Date: 2026-08-31 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "z1a2b3c4d5e6"
down_revision: Union[str, None] = "x9y0z1a2b3c4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    role_permissions = sa.table(
        "role_permissions",
        sa.column("role_code", sa.String),
        sa.column("permission_code", sa.String),
        sa.column("scope", sa.String),
    )
    op.bulk_insert(role_permissions, [
        {"role_code": "pharmacist", "permission_code": "payments.read", "scope": "all"},
    ])


def downgrade() -> None:
    role_permissions = sa.table(
        "role_permissions",
        sa.column("role_code", sa.String),
        sa.column("permission_code", sa.String),
    )
    op.execute(
        role_permissions.delete().where(
            sa.and_(
                role_permissions.c.role_code == "pharmacist",
                role_permissions.c.permission_code == "payments.read",
            )
        )
    )
