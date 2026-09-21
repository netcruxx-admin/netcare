"""medication_orders: administered_by/administered_at (parity with injection_orders)

InjectionOrder has carried administered_by/administered_at since its own
migration — written as server facts on the administer transition, not just a
status flip. MedicationOrder never got the same pair, so there has been no
record of who administered a medicine or when, only that its status became
"administered". This is the literal medication-administration-record gap:
routers/medication_orders.py's administer_order now writes both, mirroring
injection_orders.py's administer_injection_order exactly.

Not IPD-specific — this closes a pre-existing OPD gap too, since medication
orders aren't module-gated. Both columns nullable, ADD COLUMN-only, no effect
on any existing row.

Revision ID: 7daa3c0bdc9b
Revises: ea030916d0d3
Create Date: 2026-09-17 00:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '7daa3c0bdc9b'
down_revision: Union[str, None] = 'ea030916d0d3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('medication_orders', sa.Column('administered_by', sa.String(), nullable=True))
    op.add_column('medication_orders', sa.Column('administered_at', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('medication_orders', 'administered_at')
    op.drop_column('medication_orders', 'administered_by')
