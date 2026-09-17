"""IPD: progress notes, discharge summaries, admission charge items

Migration 2 of the IPD plan (see docs/IPD_MODULE_CHANGELOG.md). Purely
additive — three more new tables, unreferenced by any existing code path.

Revision ID: 205e56695c57
Revises: e48dd4ce38b9
Create Date: 2026-09-15 00:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '205e56695c57'
down_revision: Union[str, None] = 'e48dd4ce38b9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── progress_notes ───────────────────────────────────────────────────────
    op.create_table(
        'progress_notes',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('hospital_id', sa.String(), nullable=False),
        sa.Column('admission_id', sa.String(), nullable=False),
        sa.Column('doctor_id', sa.String(), nullable=False),
        sa.Column('note', sa.Text(), server_default='', nullable=True),
        sa.Column('created_at', sa.String(), nullable=False),
        sa.ForeignKeyConstraint(['hospital_id'], ['hospitals.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_progress_notes_hospital_id'), 'progress_notes', ['hospital_id'])
    op.create_index(op.f('ix_progress_notes_admission_id'), 'progress_notes', ['admission_id'])
    op.create_index(op.f('ix_progress_notes_doctor_id'), 'progress_notes', ['doctor_id'])

    # ── discharge_summaries ──────────────────────────────────────────────────
    op.create_table(
        'discharge_summaries',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('hospital_id', sa.String(), nullable=False),
        sa.Column('admission_id', sa.String(), nullable=False),
        sa.Column('doctor_id', sa.String(), nullable=False),
        sa.Column('diagnosis_final', sa.Text(), server_default='', nullable=True),
        sa.Column('hospital_course', sa.Text(), server_default='', nullable=True),
        sa.Column('condition_at_discharge', sa.Text(), server_default='', nullable=True),
        sa.Column('discharge_medications', sa.Text(), server_default='', nullable=True),
        sa.Column('follow_up_advice', sa.Text(), server_default='', nullable=True),
        sa.Column('discharge_type', sa.String(), server_default='routine', nullable=True),
        sa.Column('discharged_at', sa.String(), nullable=False),
        sa.Column('created_at', sa.String(), nullable=False),
        sa.ForeignKeyConstraint(['hospital_id'], ['hospitals.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('admission_id', name='uq_discharge_summaries_admission'),
    )
    op.create_index(op.f('ix_discharge_summaries_hospital_id'), 'discharge_summaries', ['hospital_id'])
    op.create_index(op.f('ix_discharge_summaries_admission_id'), 'discharge_summaries', ['admission_id'])
    op.create_index(op.f('ix_discharge_summaries_doctor_id'), 'discharge_summaries', ['doctor_id'])

    # ── admission_charge_items ───────────────────────────────────────────────
    op.create_table(
        'admission_charge_items',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('hospital_id', sa.String(), nullable=False),
        sa.Column('admission_id', sa.String(), nullable=False),
        sa.Column('charge_type', sa.String(), nullable=False),
        sa.Column('description', sa.String(), server_default='', nullable=True),
        sa.Column('amount', sa.Float(), nullable=False, server_default='0'),
        sa.Column('quantity', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('created_by', sa.String(), nullable=True),
        sa.Column('charged_at', sa.String(), nullable=False),
        sa.ForeignKeyConstraint(['hospital_id'], ['hospitals.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_admission_charge_items_hospital_id'), 'admission_charge_items', ['hospital_id'])
    op.create_index(op.f('ix_admission_charge_items_admission_id'), 'admission_charge_items', ['admission_id'])


def downgrade() -> None:
    op.drop_index(op.f('ix_admission_charge_items_admission_id'), table_name='admission_charge_items')
    op.drop_index(op.f('ix_admission_charge_items_hospital_id'), table_name='admission_charge_items')
    op.drop_table('admission_charge_items')

    op.drop_index(op.f('ix_discharge_summaries_doctor_id'), table_name='discharge_summaries')
    op.drop_index(op.f('ix_discharge_summaries_admission_id'), table_name='discharge_summaries')
    op.drop_index(op.f('ix_discharge_summaries_hospital_id'), table_name='discharge_summaries')
    op.drop_table('discharge_summaries')

    op.drop_index(op.f('ix_progress_notes_doctor_id'), table_name='progress_notes')
    op.drop_index(op.f('ix_progress_notes_admission_id'), table_name='progress_notes')
    op.drop_index(op.f('ix_progress_notes_hospital_id'), table_name='progress_notes')
    op.drop_table('progress_notes')
