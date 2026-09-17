"""IPD: nullable admission_id on medication_orders, injection_orders, test_orders, payments

Migration 3 of the IPD plan (see docs/IPD_MODULE_CHANGELOG.md). Each of these
four tables already tolerates appointment_id being NULL (an OTC hand-out, a
ward-round order, a pharmacy/lab payment with no visit) — this adds a second,
independently-nullable column for the IPD case rather than making the two
columns mutually exclusive at the DB level, which would break the existing
"neither" case these tables already support.

All four ADD COLUMN calls are metadata-only in Postgres (nullable, no
computed default) — no table rewrite, no lock beyond the DDL itself, no effect
on any existing row or any existing query that doesn't reference the new
column.

Revision ID: 061499cf1d90
Revises: 205e56695c57
Create Date: 2026-09-15 00:15:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '061499cf1d90'
down_revision: Union[str, None] = '205e56695c57'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('payments', sa.Column('admission_id', sa.String(), nullable=True))
    op.create_index(op.f('ix_payments_admission_id'), 'payments', ['admission_id'])

    op.add_column('medication_orders', sa.Column('admission_id', sa.String(), nullable=True))
    op.create_index(op.f('ix_medication_orders_admission_id'), 'medication_orders', ['admission_id'])

    op.add_column('injection_orders', sa.Column('admission_id', sa.String(), nullable=True))
    op.create_index(op.f('ix_injection_orders_admission_id'), 'injection_orders', ['admission_id'])

    op.add_column('test_orders', sa.Column('admission_id', sa.String(), nullable=True))
    op.create_index(op.f('ix_test_orders_admission_id'), 'test_orders', ['admission_id'])


def downgrade() -> None:
    op.drop_index(op.f('ix_test_orders_admission_id'), table_name='test_orders')
    op.drop_column('test_orders', 'admission_id')

    op.drop_index(op.f('ix_injection_orders_admission_id'), table_name='injection_orders')
    op.drop_column('injection_orders', 'admission_id')

    op.drop_index(op.f('ix_medication_orders_admission_id'), table_name='medication_orders')
    op.drop_column('medication_orders', 'admission_id')

    op.drop_index(op.f('ix_payments_admission_id'), table_name='payments')
    op.drop_column('payments', 'admission_id')
