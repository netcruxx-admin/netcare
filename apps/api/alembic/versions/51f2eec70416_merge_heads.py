"""merge heads

Revision ID: 51f2eec70416
Revises: 8d94a370030c, q2r3s4t5u6v7
Create Date: 2026-09-15 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '51f2eec70416'
down_revision: Union[str, None] = ('8d94a370030c', 'q2r3s4t5u6v7')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
