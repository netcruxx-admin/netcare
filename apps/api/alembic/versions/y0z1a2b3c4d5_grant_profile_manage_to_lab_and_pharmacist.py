"""grant profile.manage to lab and pharmacist roles

Both roles were missing profile.manage, so the Profile tab never appeared
in their sidebars even though it was listed in viewRoles on the frontend.

Renumbered on merge: this arrived on the FCM branch as u6v7w8x9y0z1, an id
already taken on dev by the password-change migration. Two files with the same
revision id give alembic an ambiguous graph ("Multiple head revisions"), and
`upgrade head` refuses to run at all. Git saw two different filenames, so the
collision survived the merge silently.

Re-pointed to the end of the chain rather than spliced into the middle: this
grant is order-independent and idempotent, so re-running it on a database that
already applied it under the old id is a no-op.

Revision ID: y0z1a2b3c4d5
Revises: w8x9y0z1a2b3
Create Date: 2026-08-24
"""
from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = 'y0z1a2b3c4d5'
down_revision: Union[str, None] = 'w8x9y0z1a2b3'
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    for role_code in ('lab', 'pharmacist'):
        exists = conn.execute(
            sa.text(
                "SELECT 1 FROM role_permissions "
                "WHERE role_code = :role AND permission_code = 'profile.manage'"
            ),
            {"role": role_code},
        ).fetchone()
        if not exists:
            conn.execute(
                sa.text(
                    "INSERT INTO role_permissions (role_code, permission_code, scope) "
                    "VALUES (:role, 'profile.manage', NULL)"
                ),
                {"role": role_code},
            )


def downgrade() -> None:
    conn = op.get_bind()
    for role_code in ('lab', 'pharmacist'):
        conn.execute(
            sa.text(
                "DELETE FROM role_permissions "
                "WHERE role_code = :role AND permission_code = 'profile.manage'"
            ),
            {"role": role_code},
        )
