"""Vitals: pain score, blood glucose, head circumference

Three measurements that specialties record and the general form never had:
pain score (orthopedics, emergency, oncology, surgery), blood glucose (general
medicine, endocrinology, neurology, emergency), head circumference (pediatrics
and neonatology). Which departments show them is clinical_fields.py's call.

Revision ID: f4a5b6c7d8e9
Revises: e3f4a5b6c7d8
Create Date: 2026-10-13 00:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f4a5b6c7d8e9'
down_revision: Union[str, None] = 'e3f4a5b6c7d8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('vitals', sa.Column('pain_score', sa.Integer(), nullable=True, server_default='0'))
    op.add_column('vitals', sa.Column('blood_glucose', sa.Float(), nullable=True, server_default='0'))
    op.add_column('vitals', sa.Column('head_circumference', sa.Float(), nullable=True, server_default='0'))


def downgrade() -> None:
    op.drop_column('vitals', 'head_circumference')
    op.drop_column('vitals', 'blood_glucose')
    op.drop_column('vitals', 'pain_score')
