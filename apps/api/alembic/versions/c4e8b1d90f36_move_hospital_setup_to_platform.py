"""hospital setup is the platform's screen, not the hospital's

`hospital.settings.manage` gates /dashboard/setup, which picks a hospital's
category template and rewrites its department list wholesale. Neither is a thing
a hospital admin should do to their own live tenant: the category is a
provisioning decision (it determines which licences apply and which modules are
enabled), and "apply template" deletes every existing department before
recreating them — with appointments booked into those departments.

So the grant moves to superadmin, who already holds `hospitals.manage` and is
the role that makes provisioning decisions everywhere else.

Hospital admins keep `departments.read` and `departments.manage`, so they still
run their own departments from /dashboard/departments. What they lose is the
template bulldozer and the category picker.

Revision ID: c4e8b1d90f36
Revises: b2d4f6a8c0e1
Create Date: 2026-08-19 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c4e8b1d90f36'
down_revision: Union[str, None] = 'b2d4f6a8c0e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

PERMISSION = "hospital.settings.manage"


def upgrade() -> None:
    conn = op.get_bind()
    # Grant first, revoke second. The other order leaves a window — however
    # short — in which nobody at all holds it.
    conn.execute(
        sa.text(
            "INSERT INTO role_permissions (role_code, permission_code, scope) "
            "VALUES ('superadmin', :code, NULL) ON CONFLICT DO NOTHING"
        ),
        {"code": PERMISSION},
    )
    conn.execute(
        sa.text(
            "DELETE FROM role_permissions "
            "WHERE role_code = 'admin' AND permission_code = :code"
        ),
        {"code": PERMISSION},
    )


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        sa.text(
            "INSERT INTO role_permissions (role_code, permission_code, scope) "
            "VALUES ('admin', :code, NULL) ON CONFLICT DO NOTHING"
        ),
        {"code": PERMISSION},
    )
    conn.execute(
        sa.text(
            "DELETE FROM role_permissions "
            "WHERE role_code = 'superadmin' AND permission_code = :code"
        ),
        {"code": PERMISSION},
    )
