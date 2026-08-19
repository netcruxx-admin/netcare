"""add roles.home_path

Roles became runtime-managed data (superadmin CRUD), but the frontend still
routed by a hardcoded per-role redirect chain, so a newly created role had
nowhere to land. `home_path` lets each role declare its own landing route.

It cannot be derived from `code`: superadmin lands on /dashboard/platform, not
/dashboard/superadmin. Custom roles default to "" and the frontend falls back
to a generic landing page.

Revision ID: f1c27a9d4b06
Revises: e3b64d1563cb
Create Date: 2026-07-30 09:12:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f1c27a9d4b06'
down_revision: Union[str, None] = 'e3b64d1563cb'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Landing route per built-in role, matching the folders under app/dashboard/.
HOME_PATHS = {
    "superadmin": "/dashboard/platform",
    "admin": "/dashboard/admin",
    "doctor": "/dashboard/doctor",
    "nurse": "/dashboard/nurse",
    "lab": "/dashboard/lab",
    "patient": "/dashboard/patient",
}


def upgrade() -> None:
    # Added nullable then backfilled then made NOT NULL, so the migration works
    # against a table that already holds the six seeded roles.
    op.add_column('roles', sa.Column('home_path', sa.String(), nullable=True))

    roles = sa.table('roles', sa.column('code', sa.String), sa.column('home_path', sa.String))
    op.execute(roles.update().values(home_path=''))
    for code, home_path in HOME_PATHS.items():
        op.execute(roles.update().where(roles.c.code == code).values(home_path=home_path))

    op.alter_column('roles', 'home_path', nullable=False)


def downgrade() -> None:
    op.drop_column('roles', 'home_path')
