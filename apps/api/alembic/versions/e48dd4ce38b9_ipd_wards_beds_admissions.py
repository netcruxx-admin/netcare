"""IPD: wards, beds, admissions, bed assignments

First schema migration for the IPD module (see docs/IPD_MODULE_CHANGELOG.md).
Purely additive — four new tables, none of them referenced anywhere yet, so
this has no effect on any hospital until the IPD routers and the "ipd" module
flag exist and are turned on for a specific hospital. Migration 1 of the plan
in that document; migrations 2-6 follow separately.

Ward -> Bed -> Admission -> BedAssignment mirrors app/models.py exactly:
  * wards.department_id is SET NULL, like doctors.department_id.
  * beds.ward_id is CASCADE — a bed cannot exist without its ward.
  * admissions/bed_assignments reference patient_id/doctor_id/ward_id/bed_id
    as plain indexed strings, not FKs, matching how appointments.patient_id
    and appointments.doctor_id are already done — tenant/reference integrity
    for those is enforced in application code (assert_in_tenant /
    assert_body_in_tenant), not a DB constraint.

Revision ID: e48dd4ce38b9
Revises: 51f2eec70416
Create Date: 2026-09-15 00:05:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e48dd4ce38b9'
down_revision: Union[str, None] = '51f2eec70416'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── wards ────────────────────────────────────────────────────────────────
    op.create_table(
        'wards',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('hospital_id', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('ward_type', sa.String(), server_default='general', nullable=True),
        sa.Column('department_id', sa.String(), nullable=True),
        sa.Column('floor', sa.String(), server_default='', nullable=True),
        sa.Column('description', sa.Text(), server_default='', nullable=True),
        sa.ForeignKeyConstraint(['hospital_id'], ['hospitals.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['department_id'], ['departments.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_wards_hospital_id'), 'wards', ['hospital_id'])

    # ── beds ─────────────────────────────────────────────────────────────────
    op.create_table(
        'beds',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('hospital_id', sa.String(), nullable=False),
        sa.Column('ward_id', sa.String(), nullable=False),
        sa.Column('bed_number', sa.String(), nullable=False),
        sa.Column('bed_type', sa.String(), server_default='general', nullable=True),
        sa.Column('daily_rate', sa.Float(), server_default='0', nullable=True),
        sa.Column('status', sa.String(), server_default='vacant', nullable=True),
        sa.ForeignKeyConstraint(['hospital_id'], ['hospitals.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['ward_id'], ['wards.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('ward_id', 'bed_number', name='uq_beds_ward_bed_number'),
    )
    op.create_index(op.f('ix_beds_hospital_id'), 'beds', ['hospital_id'])
    op.create_index(op.f('ix_beds_ward_id'), 'beds', ['ward_id'])

    # ── admissions ───────────────────────────────────────────────────────────
    op.create_table(
        'admissions',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('hospital_id', sa.String(), nullable=False),
        sa.Column('admission_number', sa.String(), nullable=False),
        sa.Column('patient_id', sa.String(), nullable=False),
        sa.Column('doctor_id', sa.String(), nullable=False),
        sa.Column('referring_doctor_id', sa.String(), nullable=True),
        sa.Column('ward_id', sa.String(), nullable=False),
        sa.Column('bed_id', sa.String(), nullable=False),
        sa.Column('admission_type', sa.String(), server_default='planned', nullable=True),
        sa.Column('status', sa.String(), server_default='admitted', nullable=True),
        sa.Column('provisional_diagnosis', sa.Text(), server_default='', nullable=True),
        sa.Column('payer_type', sa.String(), server_default='cash', nullable=True),
        sa.Column('admitted_by_user_id', sa.String(), nullable=True),
        sa.Column('admitted_by_role', sa.String(), nullable=True),
        sa.Column('admitted_at', sa.String(), nullable=False),
        sa.Column('discharged_at', sa.String(), nullable=True),
        sa.Column('created_at', sa.String(), nullable=False),
        sa.ForeignKeyConstraint(['hospital_id'], ['hospitals.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('hospital_id', 'admission_number', name='uq_admissions_tenant_number'),
    )
    op.create_index(op.f('ix_admissions_hospital_id'), 'admissions', ['hospital_id'])
    op.create_index(op.f('ix_admissions_patient_id'), 'admissions', ['patient_id'])
    op.create_index(op.f('ix_admissions_doctor_id'), 'admissions', ['doctor_id'])
    op.create_index(op.f('ix_admissions_ward_id'), 'admissions', ['ward_id'])
    op.create_index(op.f('ix_admissions_bed_id'), 'admissions', ['bed_id'])

    # ── bed_assignments ──────────────────────────────────────────────────────
    op.create_table(
        'bed_assignments',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('hospital_id', sa.String(), nullable=False),
        sa.Column('admission_id', sa.String(), nullable=False),
        sa.Column('ward_id', sa.String(), nullable=False),
        sa.Column('bed_id', sa.String(), nullable=False),
        sa.Column('assigned_at', sa.String(), nullable=False),
        sa.Column('released_at', sa.String(), nullable=True),
        sa.ForeignKeyConstraint(['hospital_id'], ['hospitals.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_bed_assignments_hospital_id'), 'bed_assignments', ['hospital_id'])
    op.create_index(op.f('ix_bed_assignments_admission_id'), 'bed_assignments', ['admission_id'])
    op.create_index(op.f('ix_bed_assignments_ward_id'), 'bed_assignments', ['ward_id'])
    op.create_index(op.f('ix_bed_assignments_bed_id'), 'bed_assignments', ['bed_id'])


def downgrade() -> None:
    op.drop_index(op.f('ix_bed_assignments_bed_id'), table_name='bed_assignments')
    op.drop_index(op.f('ix_bed_assignments_ward_id'), table_name='bed_assignments')
    op.drop_index(op.f('ix_bed_assignments_admission_id'), table_name='bed_assignments')
    op.drop_index(op.f('ix_bed_assignments_hospital_id'), table_name='bed_assignments')
    op.drop_table('bed_assignments')

    op.drop_index(op.f('ix_admissions_bed_id'), table_name='admissions')
    op.drop_index(op.f('ix_admissions_ward_id'), table_name='admissions')
    op.drop_index(op.f('ix_admissions_doctor_id'), table_name='admissions')
    op.drop_index(op.f('ix_admissions_patient_id'), table_name='admissions')
    op.drop_index(op.f('ix_admissions_hospital_id'), table_name='admissions')
    op.drop_table('admissions')

    op.drop_index(op.f('ix_beds_ward_id'), table_name='beds')
    op.drop_index(op.f('ix_beds_hospital_id'), table_name='beds')
    op.drop_table('beds')

    op.drop_index(op.f('ix_wards_hospital_id'), table_name='wards')
    op.drop_table('wards')
