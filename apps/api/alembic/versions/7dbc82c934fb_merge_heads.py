"""merge heads

Revision ID: 7dbc82c934fb
Revises: c2d3e4f5a6b7, d776cc07541a
Create Date: 2026-09-13 01:48:27.474064

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7dbc82c934fb'
down_revision: Union[str, None] = ('c2d3e4f5a6b7', 'd776cc07541a')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
