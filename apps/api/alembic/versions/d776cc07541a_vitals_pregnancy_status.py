"""vitals: explicit pregnancy_status

LMP alone does not mean the patient is pregnant, and a blank LMP does not
mean menopause — both were previously left to be inferred from the LMP field
by whoever read the record, which is wrong on both counts:

  - LMP present, not pregnant -> EDD/POG must not be computed or shown; they
    are not meaningful outside an actual pregnancy.
  - LMP absent -> could mean "not asked yet" just as easily as menopause;
    only an explicit status can tell the two apart.

`pregnancy_status` makes the call explicit: "" (not recorded) | "pregnant" |
"not_pregnant" | "menopause". The frontend gates LMP/EDD/POG entry on it
rather than inferring anything from LMP's presence or absence.

Revision ID: d776cc07541a
Revises: 8e496818cecd
Create Date: 2026-09-12 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd776cc07541a'
down_revision: Union[str, None] = '8e496818cecd'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("vitals", sa.Column("pregnancy_status", sa.String(), nullable=False, server_default=""))


def downgrade() -> None:
    op.drop_column("vitals", "pregnancy_status")
