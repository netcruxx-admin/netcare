"""separate reviewing a lab report from processing it

The doctor who ordered a test signs off on the finding; the lab collects the
sample and publishes the result. Those are held by different people, so folding
the doctor's sign-off into `lab_orders.process` would have handed every doctor
the ability to publish results. This adds the narrower capability instead.

Revision ID: a91d0e57cb43
Revises: f4b6019ac82d
Create Date: 2026-07-31 20:15:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a91d0e57cb43'
down_revision: Union[str, None] = 'f4b6019ac82d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


NEW_PERMISSION = (
    "lab_orders.review", "Review lab reports",
    "Sign off on a published result for a test you ordered.",
    "lab_orders", "review", "lab", True, 525,
)

# Scope "own": a doctor reviews the orders they raised, not the whole hospital's.
GRANTS = [("doctor", "own"), ("admin", "all")]


def upgrade() -> None:
    permissions = sa.table(
        'permissions',
        sa.column('code', sa.String), sa.column('label', sa.String),
        sa.column('description', sa.String), sa.column('resource', sa.String),
        sa.column('action', sa.String), sa.column('module', sa.String),
        sa.column('supports_scope', sa.Boolean), sa.column('sort_order', sa.Integer),
    )
    code, label, description, resource, action, module, supports_scope, sort_order = NEW_PERMISSION
    op.bulk_insert(permissions, [{
        "code": code, "label": label, "description": description,
        "resource": resource, "action": action, "module": module,
        "supports_scope": supports_scope, "sort_order": sort_order,
    }])

    role_permissions = sa.table(
        'role_permissions',
        sa.column('role_code', sa.String), sa.column('permission_code', sa.String),
        sa.column('scope', sa.String),
    )
    op.bulk_insert(role_permissions, [
        {"role_code": role, "permission_code": code, "scope": scope}
        for role, scope in GRANTS
    ])


def downgrade() -> None:
    code = NEW_PERMISSION[0]
    role_permissions = sa.table(
        'role_permissions', sa.column('permission_code', sa.String)
    )
    op.execute(role_permissions.delete().where(role_permissions.c.permission_code == code))
    permissions = sa.table('permissions', sa.column('code', sa.String))
    op.execute(permissions.delete().where(permissions.c.code == code))
