"""configurable lunch break per hospital

Adds lunch_break_start / lunch_break_end to hospital_profiles so each tenant
can set its own mid-day break window. The booking UI reads these from
GET /hospitals/current/operational (public) and uses them instead of the
former hardcoded 12:00-13:30 block.

A new permission `hospital.operational.manage` lets the hospital admin change
the setting for their own hospital without touching the platform-level profile
endpoint (which stays behind `hospitals.manage`).

Revision ID: e8b3a1c94d72
Revises: d7a2c5f81e64
Create Date: 2026-08-20 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e8b3a1c94d72'
down_revision: Union[str, None] = 'd7a2c5f81e64'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

PERMISSION = "hospital.operational.manage"


def upgrade() -> None:
    # 1. Add columns to hospital_profiles.
    op.add_column(
        "hospital_profiles",
        sa.Column("lunch_break_start", sa.String(), nullable=True, server_default="12:00"),
    )
    op.add_column(
        "hospital_profiles",
        sa.Column("lunch_break_end", sa.String(), nullable=True, server_default="14:00"),
    )

    # 2. Back-fill existing rows.
    op.get_bind().execute(
        sa.text(
            "UPDATE hospital_profiles "
            "SET lunch_break_start = '12:00', lunch_break_end = '14:00' "
            "WHERE lunch_break_start IS NULL"
        )
    )

    # 3. Register the permission in the catalog (all NOT NULL columns required).
    permissions = sa.table(
        "permissions",
        sa.column("code", sa.String),
        sa.column("label", sa.String),
        sa.column("description", sa.String),
        sa.column("resource", sa.String),
        sa.column("action", sa.String),
        sa.column("module", sa.String),
        sa.column("supports_scope", sa.Boolean),
        sa.column("sort_order", sa.Integer),
    )
    op.bulk_insert(permissions, [
        {
            "code": PERMISSION,
            "label": "Manage hospital operational settings",
            "description": "Configure lunch break window and other operational settings for own hospital.",
            "resource": "hospital",
            "action": "operational.manage",
            "module": None,
            "supports_scope": False,
            "sort_order": 0,
        }
    ])

    # 4. Grant it to the admin role.
    role_permissions = sa.table(
        "role_permissions",
        sa.column("role_code", sa.String),
        sa.column("permission_code", sa.String),
        sa.column("scope", sa.String),
    )
    op.bulk_insert(role_permissions, [
        {"role_code": "admin", "permission_code": PERMISSION, "scope": None},
    ])


def downgrade() -> None:
    conn = op.get_bind()

    conn.execute(
        sa.text(
            "DELETE FROM role_permissions "
            "WHERE role_code = 'admin' AND permission_code = :code"
        ),
        {"code": PERMISSION},
    )
    conn.execute(
        sa.text("DELETE FROM permissions WHERE code = :code"),
        {"code": PERMISSION},
    )

    op.drop_column("hospital_profiles", "lunch_break_end")
    op.drop_column("hospital_profiles", "lunch_break_start")
