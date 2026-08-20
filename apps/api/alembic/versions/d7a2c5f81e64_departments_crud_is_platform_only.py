"""department CRUD belongs to the platform

Departments are the spine of booking: appointments are filed into them and
doctors belong to them. Editing or deleting one on a live tenant reaches records
that are already pointing at it, which makes it a provisioning decision rather
than day-to-day administration — the same reasoning that moved
`hospital.settings.manage` in c4e8b1d90f36.

So `departments.manage` moves to superadmin, who runs it cross-tenant from
/dashboard/departments.

`departments.read` deliberately STAYS with admin (and everyone else who had it).
The department list is not the departments screen: the admin overview, the
appointments board, the doctors list and both doctor modals all read it, and the
doctor modals write `department_id`. Revoking read to hide one screen would have
broken creating a doctor.

Revision ID: d7a2c5f81e64
Revises: c4e8b1d90f36
Create Date: 2026-08-19 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd7a2c5f81e64'
down_revision: Union[str, None] = 'c4e8b1d90f36'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

PERMISSION = "departments.manage"
# Superadmin already holds it from c7e93b2a1d84; the insert is here so the
# capability survives even on a database where that grant was removed by hand
# through the Roles UI.
KEEPS = "superadmin"
LOSES = "admin"


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        sa.text(
            "INSERT INTO role_permissions (role_code, permission_code, scope) "
            "VALUES (:role, :code, NULL) ON CONFLICT DO NOTHING"
        ),
        {"role": KEEPS, "code": PERMISSION},
    )
    conn.execute(
        sa.text(
            "DELETE FROM role_permissions "
            "WHERE role_code = :role AND permission_code = :code"
        ),
        {"role": LOSES, "code": PERMISSION},
    )


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        sa.text(
            "INSERT INTO role_permissions (role_code, permission_code, scope) "
            "VALUES (:role, :code, NULL) ON CONFLICT DO NOTHING"
        ),
        {"role": LOSES, "code": PERMISSION},
    )
