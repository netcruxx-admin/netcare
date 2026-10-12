"""Specialty encounters: table, permissions and grants

One tenant-scoped table for every specialty's visit; what a visit records lives
in the template catalog (app/specialties.py), not in the schema.

module='specialties', so effective_permissions() drops all of these for any
hospital whose modules.specialties is not true -- inert for every hospital that
exists today, the same way the ipd module arrived.

Grants start narrow. Doctors read and write their own encounters, nurses read
all (they work across a ward), a patient reads their own, superadmin holds
everything. Admin and receptionist hold nothing: the clinical content of a visit
is not their workflow, and widening later is one migration while narrowing a
grant someone already relies on is not. Delete is superadmin's alone, like every
other <resource>.delete.

Revision ID: b9c8d7e6f5a4
Revises: 75a8e91855c1
Create Date: 2026-10-08 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b9c8d7e6f5a4'
down_revision: Union[str, None] = '75a8e91855c1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# (code, label, description, resource, action, module, supports_scope, sort_order)
NEW_PERMISSIONS = [
    ('specialty_encounters.read', 'View specialty encounters',
     "Read a patient's specialty visit records.",
     'specialty_encounters', 'read', 'specialties', True, 1300),
    ('specialty_encounters.write', 'Record specialty encounters',
     'Record and edit a specialty visit.',
     'specialty_encounters', 'write', 'specialties', True, 1305),
    ('specialty_encounters.delete', 'Delete specialty encounters',
     'Permanently remove a specialty visit record.',
     'specialty_encounters', 'delete', 'specialties', False, 1310),
]

NEW_GRANTS = [
    ('doctor', 'specialty_encounters.read', 'own'),
    ('doctor', 'specialty_encounters.write', 'own'),
    ('nurse', 'specialty_encounters.read', 'all'),
    ('patient', 'specialty_encounters.read', 'own'),
    ('superadmin', 'specialty_encounters.read', 'all'),
    ('superadmin', 'specialty_encounters.write', 'all'),
    ('superadmin', 'specialty_encounters.delete', None),
]


def upgrade() -> None:
    op.create_table(
        'specialty_encounters',
        sa.Column('id', sa.String(), primary_key=True),
        sa.Column('hospital_id', sa.String(), sa.ForeignKey('hospitals.id', ondelete='CASCADE'), nullable=False),
        sa.Column('patient_id', sa.String(), nullable=False),
        sa.Column('doctor_id', sa.String(), nullable=False),
        sa.Column('appointment_id', sa.String(), nullable=True),
        sa.Column('specialty', sa.String(), nullable=False),
        sa.Column('template_version', sa.Integer(), nullable=False),
        sa.Column('data', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.String(), nullable=False),
        sa.Column('updated_at', sa.String(), nullable=False),
    )
    for column in ('hospital_id', 'patient_id', 'doctor_id', 'specialty'):
        op.create_index(f'ix_specialty_encounters_{column}', 'specialty_encounters', [column])

    conn = op.get_bind()
    for code, label, description, resource, action, module, supports_scope, sort_order in NEW_PERMISSIONS:
        conn.execute(
            sa.text(
                "INSERT INTO permissions "
                "(code, label, description, resource, action, module, supports_scope, sort_order) "
                "VALUES (:code, :label, :description, :resource, :action, :module, :scope, :sort) "
                "ON CONFLICT DO NOTHING"
            ),
            {'code': code, 'label': label, 'description': description, 'resource': resource,
             'action': action, 'module': module, 'scope': supports_scope, 'sort': sort_order},
        )
    for role, code, scope in NEW_GRANTS:
        conn.execute(
            sa.text(
                "INSERT INTO role_permissions (role_code, permission_code, scope) "
                "VALUES (:role, :code, :scope) ON CONFLICT DO NOTHING"
            ),
            {'role': role, 'code': code, 'scope': scope},
        )


def downgrade() -> None:
    conn = op.get_bind()
    for code, *_ in NEW_PERMISSIONS:
        conn.execute(sa.text("DELETE FROM role_permissions WHERE permission_code = :c"), {'c': code})
        conn.execute(sa.text("DELETE FROM permissions WHERE code = :c"), {'c': code})
    op.drop_table('specialty_encounters')
