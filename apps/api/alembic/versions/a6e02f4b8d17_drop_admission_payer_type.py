"""admissions: drop payer_type

billing_mode (f3b71c9d0e52) replaced it. Payer was asked for on the admit
form alongside the billing mode and then read by nothing: no billing code
ever consulted it — compute_bill works off the bed's rate, the stay's charge
items and its payments — so it was a field the desk filled in that never
reached a decision.

**This drops data.** Whatever past admissions recorded as their payer is not
recoverable afterwards, and the downgrade can only put the column back empty
(defaulted to "cash" for every existing row, which is what a fresh column
gives, not what those rows said). Run it knowing that.

Revision ID: a6e02f4b8d17
Revises: f3b71c9d0e52
Create Date: 2026-09-25 00:10:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a6e02f4b8d17'
down_revision: Union[str, None] = 'f3b71c9d0e52'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("admissions", "payer_type")


def downgrade() -> None:
    # Restored with the original server_default so existing rows satisfy the
    # column, but the values they used to hold are gone — see the note above.
    op.add_column(
        "admissions",
        sa.Column("payer_type", sa.String(), nullable=True, server_default="cash"),
    )
