"""point built-in roles at the role-agnostic dashboard

The frontend no longer has a dashboard route per role: /dashboard/admin,
/dashboard/doctor, /dashboard/platform and friends were collapsed into
/dashboard, which renders the view for whichever role is signed in. The stored
home_path values pointed at URLs that no longer exist, so they are rewritten.

home_path stays on the table: a superadmin can still point a custom role at a
specific screen. Only the built-in per-role landing URLs are replaced.

Revision ID: a4d81f6c05b2
Revises: f1c27a9d4b06
Create Date: 2026-07-30 11:40:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a4d81f6c05b2'
down_revision: Union[str, None] = 'f1c27a9d4b06'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


DASHBOARD = '/dashboard'

# The per-role landing routes that no longer exist, and the role each belonged to.
OLD_HOME_PATHS = {
    "superadmin": "/dashboard/platform",
    "admin": "/dashboard/admin",
    "doctor": "/dashboard/doctor",
    "nurse": "/dashboard/nurse",
    "lab": "/dashboard/lab",
    "patient": "/dashboard/patient",
}


def upgrade() -> None:
    roles = sa.table('roles', sa.column('code', sa.String), sa.column('home_path', sa.String))
    # Only rewrite rows still holding the old value: a hospital that has since
    # pointed a role somewhere custom keeps its choice.
    for code, old_path in OLD_HOME_PATHS.items():
        op.execute(
            roles.update()
            .where(sa.and_(roles.c.code == code, roles.c.home_path == old_path))
            .values(home_path=DASHBOARD)
        )


def downgrade() -> None:
    roles = sa.table('roles', sa.column('code', sa.String), sa.column('home_path', sa.String))
    for code, old_path in OLD_HOME_PATHS.items():
        op.execute(
            roles.update()
            .where(sa.and_(roles.c.code == code, roles.c.home_path == DASHBOARD))
            .values(home_path=old_path)
        )
