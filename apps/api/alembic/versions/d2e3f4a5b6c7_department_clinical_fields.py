"""Departments choose which vitals and clinical-note fields a visit records

departments.vitals_override / notes_override are NULL by default, meaning "the
specialty's default set" (app/clinical_fields.py); a JSON list is a superadmin's
explicit choice. Nothing is backfilled: a department with no specialty records
every field, as before, and one with a specialty gets that specialty's set.

Also adds vitals.spo2, the one catalogue field with no column yet.

Revision ID: d2e3f4a5b6c7
Revises: c1d2e3f4a5b6
Create Date: 2026-10-08 02:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd2e3f4a5b6c7'
down_revision: Union[str, None] = 'c1d2e3f4a5b6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('departments', sa.Column('vitals_override', sa.JSON(), nullable=True))
    op.add_column('departments', sa.Column('notes_override', sa.JSON(), nullable=True))
    op.add_column('vitals', sa.Column('spo2', sa.Integer(), nullable=True, server_default='0'))


def downgrade() -> None:
    op.drop_column('vitals', 'spo2')
    op.drop_column('departments', 'notes_override')
    op.drop_column('departments', 'vitals_override')
