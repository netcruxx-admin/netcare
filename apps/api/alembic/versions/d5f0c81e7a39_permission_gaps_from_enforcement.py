"""fill permission gaps found while enforcing the guards

Two kinds of gap surfaced once every endpoint had a permission:

  * `vitals.read` did not exist — the catalog only had `vitals.record`, so a
    patient reading their own vitals would have needed permission to write them.
  * Several grants were missing that the UI has always depended on: a patient
    needs the doctor and department lists to book an appointment, and lab staff
    need patient names to label a sample.

Grants are additive here; nothing is revoked.

Revision ID: d5f0c81e7a39
Revises: c7e93b2a1d84
Create Date: 2026-07-31 14:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd5f0c81e7a39'
down_revision: Union[str, None] = 'c7e93b2a1d84'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


NEW_PERMISSIONS = [
    ("vitals.read", "View vitals", "See recorded patient vitals.", "vitals", "read", "nursing", True, 295),
    # Catalog reads were open to any signed-in user; they now need a grant like
    # everything else, so the permission has to exist to be granted.
    ("medicines.read", "View medicine catalog", "Browse the medicine catalog.", "medicines", "read", "pharmacy", False, 345),
    ("lab_tests.read", "View test catalog", "Browse the lab test catalog.", "lab_tests", "read", "lab", False, 535),
]

# role -> [(permission, scope)]
NEW_GRANTS = {
    # Booking needs the doctor and department lists; the patient's own vitals
    # appear on their records screen.
    # patients.read scoped to "own" is how a patient reaches their own record
    # (/patients/by-user/{id}) without being able to list anyone else's.
    "patient": [
        ("patients.read", "own"), ("doctors.read", "all"),
        ("departments.read", "all"), ("vitals.read", "own"),
    ],
    "superadmin": [("vitals.read", "all"), ("medicines.read", None), ("lab_tests.read", None)],
    # Clinical staff read vitals for the patients they can already see.
    "doctor": [
        ("doctors.read", "all"), ("departments.read", "all"), ("vitals.read", "own"),
        ("medicines.read", None), ("lab_tests.read", None),
        # Results for the tests they ordered.
        ("lab_reports.read", "own"),
    ],
    "nurse": [
        ("doctors.read", "all"), ("departments.read", "all"), ("vitals.read", "all"),
        ("medicines.read", None),
    ],
    "admin": [("vitals.read", "all"), ("medicines.read", None), ("lab_tests.read", None)],
    # A lab tech needs to know whose sample they are processing.
    # A lab tech needs to know whose sample they are processing, and who ordered it.
    "lab": [
        ("patients.read", "all"), ("departments.read", "all"),
        ("doctors.read", "all"), ("lab_tests.read", None),
    ],
}


def upgrade() -> None:
    permissions = sa.table(
        'permissions',
        sa.column('code', sa.String), sa.column('label', sa.String),
        sa.column('description', sa.String), sa.column('resource', sa.String),
        sa.column('action', sa.String), sa.column('module', sa.String),
        sa.column('supports_scope', sa.Boolean), sa.column('sort_order', sa.Integer),
    )
    op.bulk_insert(permissions, [
        {
            "code": code, "label": label, "description": description,
            "resource": resource, "action": action, "module": module,
            "supports_scope": supports_scope, "sort_order": sort_order,
        }
        for code, label, description, resource, action, module, supports_scope, sort_order in NEW_PERMISSIONS
    ])

    role_permissions = sa.table(
        'role_permissions',
        sa.column('role_code', sa.String), sa.column('permission_code', sa.String),
        sa.column('scope', sa.String),
    )
    op.bulk_insert(role_permissions, [
        {"role_code": role, "permission_code": code, "scope": scope}
        for role, grants in NEW_GRANTS.items()
        for code, scope in grants
    ])


def downgrade() -> None:
    role_permissions = sa.table(
        'role_permissions',
        sa.column('role_code', sa.String), sa.column('permission_code', sa.String),
    )
    for role, grants in NEW_GRANTS.items():
        for code, _scope in grants:
            op.execute(
                role_permissions.delete().where(
                    sa.and_(
                        role_permissions.c.role_code == role,
                        role_permissions.c.permission_code == code,
                    )
                )
            )
    permissions = sa.table('permissions', sa.column('code', sa.String))
    for code, *_ in NEW_PERMISSIONS:
        op.execute(permissions.delete().where(permissions.c.code == code))
