"""Permissions can require a doctor's department to practise a specialty

permissions.requires_specialties is NULL for almost everything. For the
antenatal and newborn permissions it names the specialties whose doctors may
hold them, so a cardiologist holding `pregnancies.read` through the doctor role
no longer has it: the API refuses and the sidebar drops the entry, because both
read the same resolved permissions.

Not a role check: the rule is on the permission and applies to anyone with a
doctor record. A doctor whose department has no specialty set is unrestricted
(see authz.effective_permissions), so no live hospital loses access until its
departments are classified.

Revision ID: e3f4a5b6c7d8
Revises: d2e3f4a5b6c7
Create Date: 2026-10-13 00:00:00.000000

"""
import json
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e3f4a5b6c7d8'
down_revision: Union[str, None] = 'd2e3f4a5b6c7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

REQUIRES = {
    'pregnancies.read': ['obstetrics-gynecology'],
    'pregnancies.manage': ['obstetrics-gynecology'],
    # Babies are cared for by neonatology and paediatrics; obstetrics delivers
    # them but the newborn record is the baby doctor's.
    'babies.read': ['neonatology', 'pediatrics'],
    'babies.manage': ['neonatology', 'pediatrics'],
}


def upgrade() -> None:
    op.add_column('permissions', sa.Column('requires_specialties', sa.JSON(), nullable=True))
    conn = op.get_bind()
    for code, specialties in REQUIRES.items():
        conn.execute(
            sa.text("UPDATE permissions SET requires_specialties = CAST(:s AS JSON) WHERE code = :c"),
            {'s': json.dumps(specialties), 'c': code},
        )


def downgrade() -> None:
    op.drop_column('permissions', 'requires_specialties')
