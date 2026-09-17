"""IPD: deletion is a platform capability, not a hospital one

Same split as x9y0z1a2b3c4 (delete_is_platform_only), extended to the IPD
resources this plan adds: wards.delete, beds.delete, admissions.delete, each
its own permission, granted to superadmin alone. wards.manage/beds.manage/
admissions.manage keep covering create and edit for a hospital admin — this
migration does not touch those grants.

module='ipd' on each, matching how vitals.delete carries module='nursing' and
prescriptions.delete carries module='pharmacy' in x9y0z1a2b3c4 — these
resources only exist under the ipd module, unlike users/patients/appointments
which are core and carry module=None.

An admission is a medico-legal record; routine "undo" is the status column
(dama/cancelled-before-admit), not a delete. This permission exists for the
same platform-correction reason patients.delete does, not for anyone's normal
workflow.

Revision ID: d82b1ad42845
Revises: 639864825d7d
Create Date: 2026-09-15 00:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd82b1ad42845'
down_revision: Union[str, None] = '639864825d7d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# (code, label, description, resource, action, module, supports_scope, sort_order)
NEW_PERMISSIONS = [
    ("wards.delete", "Delete wards", "Permanently remove a hospital ward.",
     "wards", "delete", "ipd", False, 1005),
    ("beds.delete", "Delete beds", "Permanently remove a bed.",
     "beds", "delete", "ipd", False, 1025),
    ("admissions.delete", "Delete admissions", "Permanently remove an IPD admission record.",
     "admissions", "delete", "ipd", False, 1065),
]


def upgrade() -> None:
    conn = op.get_bind()
    for row in NEW_PERMISSIONS:
        conn.execute(
            sa.text(
                "INSERT INTO permissions "
                "(code, label, description, resource, action, module, supports_scope, sort_order) "
                "VALUES (:code, :label, :description, :resource, :action, :module, :scope, :sort) "
                "ON CONFLICT DO NOTHING"
            ),
            dict(zip(
                ("code", "label", "description", "resource", "action", "module", "scope", "sort"),
                row,
            )),
        )
        # Scope is NULL: deletion is not an own/all question, same as every
        # other <resource>.delete permission.
        conn.execute(
            sa.text(
                "INSERT INTO role_permissions (role_code, permission_code, scope) "
                "VALUES ('superadmin', :code, NULL) ON CONFLICT DO NOTHING"
            ),
            {"code": row[0]},
        )


def downgrade() -> None:
    conn = op.get_bind()
    for row in NEW_PERMISSIONS:
        conn.execute(
            sa.text("DELETE FROM role_permissions WHERE permission_code = :c"),
            {"c": row[0]},
        )
        conn.execute(sa.text("DELETE FROM permissions WHERE code = :c"), {"c": row[0]})
