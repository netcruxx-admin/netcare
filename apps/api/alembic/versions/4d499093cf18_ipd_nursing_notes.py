"""IPD: nursing_notes (the nurse-round counterpart of progress_notes)

Closes a real gap: progress_notes.write is doctor-only by deliberate design
(ProgressNote is doctor_id-shaped, same reasoning as MedicalRecord) — there
was no nursing-authored clinical note at all. A nursing assessment/shift note
is a distinct, real clinical-documentation type, so this is its own table
rather than a repurposed ProgressNote, same shape but nurse_id-authored with
an optional shift marker.

Purely additive — one new table, unreferenced by any existing code path until
routers/nursing_notes.py (added alongside this migration) starts writing to
it, and that router is itself gated on modules.ipd via the permissions added
in the companion migration ea030916d0d3.

Revision ID: 4d499093cf18
Revises: d82b1ad42845
Create Date: 2026-09-17 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '4d499093cf18'
down_revision: Union[str, None] = 'd82b1ad42845'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'nursing_notes',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('hospital_id', sa.String(), nullable=False),
        sa.Column('admission_id', sa.String(), nullable=False),
        sa.Column('nurse_id', sa.String(), nullable=False),
        sa.Column('shift', sa.String(), server_default='', nullable=True),
        sa.Column('note', sa.Text(), server_default='', nullable=True),
        sa.Column('created_at', sa.String(), nullable=False),
        sa.ForeignKeyConstraint(['hospital_id'], ['hospitals.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_nursing_notes_hospital_id'), 'nursing_notes', ['hospital_id'])
    op.create_index(op.f('ix_nursing_notes_admission_id'), 'nursing_notes', ['admission_id'])
    op.create_index(op.f('ix_nursing_notes_nurse_id'), 'nursing_notes', ['nurse_id'])


def downgrade() -> None:
    op.drop_index(op.f('ix_nursing_notes_nurse_id'), table_name='nursing_notes')
    op.drop_index(op.f('ix_nursing_notes_admission_id'), table_name='nursing_notes')
    op.drop_index(op.f('ix_nursing_notes_hospital_id'), table_name='nursing_notes')
    op.drop_table('nursing_notes')
