"""let nurses read prescriptions

The patient chart shows prescriptions to every member of clinical staff, and a
nurse administering medication needs to see what was prescribed. Read-only, in
the same spirit as the earlier medical-records grant: `prescriptions.manage`
stays with prescribers.

Revision ID: c60b8a3f27e5
Revises: a91d0e57cb43
Create Date: 2026-08-01 09:40:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c60b8a3f27e5'
down_revision: Union[str, None] = 'a91d0e57cb43'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


GRANTS = [("nurse", "prescriptions.read", "all")]


def upgrade() -> None:
    role_permissions = sa.table(
        'role_permissions',
        sa.column('role_code', sa.String), sa.column('permission_code', sa.String),
        sa.column('scope', sa.String),
    )
    op.bulk_insert(role_permissions, [
        {"role_code": role, "permission_code": code, "scope": scope}
        for role, code, scope in GRANTS
    ])


def downgrade() -> None:
    role_permissions = sa.table(
        'role_permissions',
        sa.column('role_code', sa.String), sa.column('permission_code', sa.String),
    )
    for role, code, _scope in GRANTS:
        op.execute(
            role_permissions.delete().where(
                sa.and_(
                    role_permissions.c.role_code == role,
                    role_permissions.c.permission_code == code,
                )
            )
        )
