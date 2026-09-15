"""merge receptionist clinical read visibility with docs-folder branch

Revision ID: 8d94a370030c
Revises: 7dbc82c934fb, b1c2d3e4f5a6
Create Date: 2026-09-15 13:20:14.702211

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8d94a370030c'
down_revision: Union[str, None] = ('7dbc82c934fb', 'b1c2d3e4f5a6')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
