"""superadmin full permission grants

The superadmin role was seeded with only platform-level permissions
(hospitals.manage, platform.read, roles.manage) plus basic read grants.
Two problems were found:

  1. Module-gated permissions (vitals.read, medicines.read, lab_tests.read,
     medical_records.read, prescriptions.read) were always dropped at runtime
     because effective_permissions() applied the hospital module mask to
     platform users who have no hospital — and an empty modules dict means
     every module-gated permission fails the check. Fixed in authz.py by
     skipping the mask for users where hospital_id IS NULL.

  2. Several action grants were missing entirely: appointments.manage,
     appointments.create, medical_records.read, prescriptions.read.
     Without these, a superadmin could view cross-hospital data but could
     not edit appointments or see clinical detail on the appointment page.

This migration adds only the missing grants (idempotent via ON CONFLICT DO NOTHING).

Revision ID: e9f1a2b3c4d5
Revises: d5f0c81e7a39
Create Date: 2026-08-01 10:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'e9f1a2b3c4d5'
down_revision: Union[str, None] = 'd72f4e18b593'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Grants to add for superadmin. ON CONFLICT DO NOTHING makes this safe to run
# even if some were manually added via the Roles UI.
NEW_SUPERADMIN_GRANTS = [
    ("appointments.manage", "all"),
    ("appointments.create", "all"),
    ("medical_records.read", "all"),
    ("prescriptions.read", "all"),
    # vitals.read was added in d5f0c81e7a39 but was silently dropped at runtime
    # because the module mask was incorrectly applied to platform users.
    # The authz.py fix handles this — no new row needed, but listed here for
    # documentation clarity.
]


def upgrade() -> None:
    conn = op.get_bind()
    for permission_code, scope in NEW_SUPERADMIN_GRANTS:
        conn.execute(
            sa.text(
                "INSERT INTO role_permissions (role_code, permission_code, scope) "
                "VALUES ('superadmin', :code, :scope) "
                "ON CONFLICT DO NOTHING"
            ),
            {"code": permission_code, "scope": scope},
        )


def downgrade() -> None:
    conn = op.get_bind()
    for permission_code, _scope in NEW_SUPERADMIN_GRANTS:
        conn.execute(
            sa.text(
                "DELETE FROM role_permissions "
                "WHERE role_code = 'superadmin' AND permission_code = :code"
            ),
            {"code": permission_code},
        )
