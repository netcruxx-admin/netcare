"""admissions: billing_mode (advance | credit)

Records whether a stay is paid up front or settled later, which is also what
decides the payer:

* ``advance`` — the patient pays on admission, so payer_type is "cash". The
  money is a Payment row against the admission (``ipd_payment``, purpose
  "deposit"), not a column here: the running bill already adds payments up,
  and a second stored copy of the same number would drift from it the moment
  a part-payment or refund was recorded.
* ``credit`` — settled later, by an insurer or company, or by a self-paying
  patient at discharge. So payer_type may be cash, insurance or corporate.

Existing rows are backfilled to "credit", which is what they factually are:
no admission created before this migration took a deposit at admission time,
so none of them is an advance. server_default keeps rows written outside the
ORM satisfying NOT NULL, the same way relation_type/relation_name do.

Revision ID: f3b71c9d0e52
Revises: d532c753c81f
Create Date: 2026-09-25 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f3b71c9d0e52'
down_revision: Union[str, None] = 'd532c753c81f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "admissions",
        sa.Column("billing_mode", sa.String(), nullable=False, server_default="credit"),
    )


def downgrade() -> None:
    op.drop_column("admissions", "billing_mode")
