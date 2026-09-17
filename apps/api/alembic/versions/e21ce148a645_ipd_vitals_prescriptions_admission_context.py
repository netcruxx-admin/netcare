"""IPD: admission_id + intake/output on vitals, admission_id on prescriptions

Migration 4 of the IPD plan (see docs/IPD_MODULE_CHANGELOG.md) — the one
revision in this plan that alters an existing constraint on live tables, so
read this one before running it anywhere near the maternity hospital's data.

What changes and why it is safe for every row that exists today:

  * vitals.appointment_id / prescriptions.appointment_id go from NOT NULL to
    nullable. This only *loosens* the column — nothing that used to be
    accepted stops being accepted. The existing VitalsCreate/PrescriptionCreate
    Pydantic schemas still require appointmentId from the OPD flow, so the API
    contract for every existing caller is unchanged even though the DB now
    permits more.
  * Both tables get a nullable admission_id (indexed) — additive, metadata-only.
  * vitals gets nullable intake_ml/output_ml (IPD nursing I/O charting) —
    additive, metadata-only.
  * Both tables get a CHECK constraint requiring exactly one of
    appointment_id/admission_id (via Postgres's built-in num_nonnulls()).
    Every row in either table today has appointment_id set and admission_id
    NULL, so num_nonnulls = 1 for all of them — the constraint validates
    cleanly against existing data with no backfill. Every write through the
    *existing* vitals.py/prescriptions.py routers continues to only ever set
    appointment_id, so new rows keep satisfying it too, until those routers
    are extended to accept an admission-linked write.

Adding a CHECK constraint validates existing rows and takes a brief
ACCESS EXCLUSIVE lock while it does — for a table this table's current size,
that is a sub-second operation, not a maintenance-window one, but it is the
one step in this migration worth watching in a slow-query log rather than
assuming instant.

Revision ID: e21ce148a645
Revises: 061499cf1d90
Create Date: 2026-09-15 00:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e21ce148a645'
down_revision: Union[str, None] = '061499cf1d90'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── prescriptions ────────────────────────────────────────────────────────
    op.add_column('prescriptions', sa.Column('admission_id', sa.String(), nullable=True))
    op.create_index(op.f('ix_prescriptions_admission_id'), 'prescriptions', ['admission_id'])
    op.alter_column('prescriptions', 'appointment_id', existing_type=sa.String(), nullable=True)
    op.create_check_constraint(
        'ck_prescriptions_exactly_one_context',
        'prescriptions',
        'num_nonnulls(appointment_id, admission_id) = 1',
    )

    # ── vitals ───────────────────────────────────────────────────────────────
    op.add_column('vitals', sa.Column('admission_id', sa.String(), nullable=True))
    op.create_index(op.f('ix_vitals_admission_id'), 'vitals', ['admission_id'])
    op.add_column('vitals', sa.Column('intake_ml', sa.Integer(), nullable=True))
    op.add_column('vitals', sa.Column('output_ml', sa.Integer(), nullable=True))
    op.alter_column('vitals', 'appointment_id', existing_type=sa.String(), nullable=True)
    op.create_check_constraint(
        'ck_vitals_exactly_one_context',
        'vitals',
        'num_nonnulls(appointment_id, admission_id) = 1',
    )


def downgrade() -> None:
    # ── vitals ───────────────────────────────────────────────────────────────
    op.drop_constraint('ck_vitals_exactly_one_context', 'vitals', type_='check')
    op.alter_column('vitals', 'appointment_id', existing_type=sa.String(), nullable=False)
    op.drop_column('vitals', 'output_ml')
    op.drop_column('vitals', 'intake_ml')
    op.drop_index(op.f('ix_vitals_admission_id'), table_name='vitals')
    op.drop_column('vitals', 'admission_id')

    # ── prescriptions ────────────────────────────────────────────────────────
    op.drop_constraint('ck_prescriptions_exactly_one_context', 'prescriptions', type_='check')
    op.alter_column('prescriptions', 'appointment_id', existing_type=sa.String(), nullable=False)
    op.drop_index(op.f('ix_prescriptions_admission_id'), table_name='prescriptions')
    op.drop_column('prescriptions', 'admission_id')
