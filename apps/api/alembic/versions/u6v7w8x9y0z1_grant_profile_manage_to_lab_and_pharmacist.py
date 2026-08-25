"""grant profile.manage to lab and pharmacist roles

Both roles were missing profile.manage, so the Profile tab never appeared
in their sidebars even though it was listed in viewRoles on the frontend.

Revision ID: u6v7w8x9y0z1
Revises: t5u6v7w8x9y0
Create Date: 2026-08-24
"""
from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = 'u6v7w8x9y0z1'
down_revision: Union[str, None] = 't5u6v7w8x9y0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    for role_code in ('lab', 'pharmacist'):
        exists = conn.execute(
            sa.text(
                "SELECT 1 FROM role_permissions "
                "WHERE role_code = :role AND permission_code = 'profile.manage'"
            ),
            {"role": role_code},
        ).fetchone()
        if not exists:
            conn.execute(
                sa.text(
                    "INSERT INTO role_permissions (role_code, permission_code, scope) "
                    "VALUES (:role, 'profile.manage', NULL)"
                ),
                {"role": role_code},
            )


def downgrade() -> None:
    conn = op.get_bind()
    for role_code in ('lab', 'pharmacist'):
        conn.execute(
            sa.text(
                "DELETE FROM role_permissions "
                "WHERE role_code = :role AND permission_code = 'profile.manage'"
            ),
            {"role": role_code},
        )
