"""let doctors book into their own diary

Doctors schedule follow-up visits from the appointment screens, but the seed
only granted `appointments.create` to patients and admins, so the follow-up
modal returned 403. Scope is "own": a doctor may create an appointment where
they are the treating doctor, and nothing else.

Revision ID: f4b6019ac82d
Revises: e2c73d5b90f1
Create Date: 2026-07-31 19:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f4b6019ac82d'
down_revision: Union[str, None] = 'e2c73d5b90f1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


GRANTS = {
    "doctor": [("appointments.create", "own")],
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
