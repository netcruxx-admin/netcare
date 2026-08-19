"""grant patients visibility of their own lab orders

The Test Reports screen lists the tests ordered for a patient alongside the
published results, but the seed only granted `lab_reports.read` — so the orders
half of that screen returned 403. Surfaced by migrating the screen onto the real
API, which is the point of doing that migration.

Scope is "own": a patient sees orders raised for them, never anyone else's.

Revision ID: e2c73d5b90f1
Revises: b8a41c92de07
Create Date: 2026-07-31 18:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e2c73d5b90f1'
down_revision: Union[str, None] = 'b8a41c92de07'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


GRANTS = {
    "patient": [("lab_orders.read", "own")],
}


def upgrade() -> None:
    role_permissions = sa.table(
        'role_permissions',
        sa.column('role_code', sa.String), sa.column('permission_code', sa.String),
        sa.column('scope', sa.String),
    )
    op.bulk_insert(role_permissions, [
        {"role_code": role, "permission_code": code, "scope": scope}
        for role, grants in GRANTS.items()
        for code, scope in grants
    ])


def downgrade() -> None:
    role_permissions = sa.table(
        'role_permissions',
        sa.column('role_code', sa.String), sa.column('permission_code', sa.String),
    )
    for role, grants in GRANTS.items():
        for code, _scope in grants:
            op.execute(
                role_permissions.delete().where(
                    sa.and_(
                        role_permissions.c.role_code == role,
                        role_permissions.c.permission_code == code,
                    )
                )
            )
