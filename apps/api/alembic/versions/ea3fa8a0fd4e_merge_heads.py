"""merge heads

Revision ID: ea3fa8a0fd4e
Revises: d776cc07541a, e4f5a6b7c8d9
Create Date: 2026-09-14 10:32:51.033943

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ea3fa8a0fd4e'
down_revision: Union[str, None] = ('d776cc07541a', 'e4f5a6b7c8d9')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
