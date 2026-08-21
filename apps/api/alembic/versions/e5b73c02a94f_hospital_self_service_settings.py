"""a hospital admin can read their own record and edit the parts they own

Everything about a hospital was gated on `hospitals.manage`, which is the
platform's permission — so an admin had no way to see their own address, let
alone correct a phone number. The screen at /dashboard/hospital-settings
already existed but only configured the lunch break.

Two new capabilities, split because reading and writing are different
questions:

  hospital.profile.read    See everything recorded about your own hospital,
                           including the parts only the platform can change.
                           Being unable to edit the GSTIN is not a reason to be
                           unable to read it — noticing it is wrong is the first
                           step to asking for it to be fixed.

  hospital.profile.manage  Edit the parts the hospital owns: address, contacts,
                           the medical director, facilities and bed counts, OPD
                           hours, slot length, branding assets, and the
                           hospital's display name/tagline/theme.

What stays with the platform, and why, is written out on
schemas.HospitalSelfUpdate — that class is the allowlist.

`hospital.operational.manage` (from e8b3a1c94d72) keeps its own grant and its
own endpoint; the lunch break is editable from either, and the new screen
folds it in with the rest of the operational config.

Revision ID: e5b73c02a94f
Revises: g1h2i3j4k5l6
Create Date: 2026-08-21 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e5b73c02a94f'
down_revision: Union[str, None] = 'g1h2i3j4k5l6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# code, label, description, resource, action, module, supports_scope, sort_order
NEW_PERMISSIONS = [
    (
        "hospital.profile.read",
        "View own hospital",
        "See everything registered about your own hospital.",
        "hospital", "profile.read", None, False, 615,
    ),
    (
        "hospital.profile.manage",
        "Edit own hospital",
        "Update your hospital's contact details, facilities, hours and branding.",
        "hospital", "profile.manage", None, False, 616,
    ),
]

GRANTS = [
    ("admin", "hospital.profile.read"),
    ("admin", "hospital.profile.manage"),
    ("superadmin", "hospital.profile.read"),
    ("superadmin", "hospital.profile.manage"),
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
    for role, code in GRANTS:
        conn.execute(
            sa.text(
                "INSERT INTO role_permissions (role_code, permission_code, scope) "
                "VALUES (:role, :code, NULL) ON CONFLICT DO NOTHING"
            ),
            {"role": role, "code": code},
        )


def downgrade() -> None:
    conn = op.get_bind()
    for role, code in GRANTS:
        conn.execute(
            sa.text(
                "DELETE FROM role_permissions "
                "WHERE role_code = :role AND permission_code = :code"
            ),
            {"role": role, "code": code},
        )
    for row in NEW_PERMISSIONS:
        conn.execute(
            sa.text("DELETE FROM permissions WHERE code = :code"), {"code": row[0]}
        )
