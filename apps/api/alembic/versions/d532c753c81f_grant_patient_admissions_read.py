"""IPD: grant patient admissions.read (own)

Without this, GET /admissions/{id} 403s a patient outright — patient already
holds discharge_summaries.read (own) and ipd_billing.read (own), but never
admissions.read, so there was no way to reach the admission itself and see
either. admissions.read already supports_scope (per 639864825d7d), so "own"
here means exactly what it means for admin/doctor: the caller must be a party
to the row (own_record_filter — a patient sees the admission they *are*).

module='ipd' on the permission itself already gates this for every hospital
without IPD enabled; this migration only adds the grant row.

Revision ID: d532c753c81f
Revises: 7daa3c0bdc9b
Create Date: 2026-09-17 00:15:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd532c753c81f'
down_revision: Union[str, None] = '7daa3c0bdc9b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        sa.text(
            "INSERT INTO role_permissions (role_code, permission_code, scope) "
            "VALUES ('patient', 'admissions.read', 'own') ON CONFLICT DO NOTHING"
        )
    )


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        sa.text(
            "DELETE FROM role_permissions WHERE role_code = 'patient' "
            "AND permission_code = 'admissions.read'"
        )
    )
