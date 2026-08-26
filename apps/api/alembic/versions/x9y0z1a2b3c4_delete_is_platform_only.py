"""deletion is a platform capability, not a hospital one

Deleting a record rode on each module's `*.manage` grant, which also covers
Create and Edit. That made "let an admin add a doctor" and "let an admin erase
a doctor" the same decision, so there was no way to hand out one without the
other.

Splitting the capability out: `<resource>.delete` is its own permission,
granted to superadmin alone. A hospital admin keeps `*.manage` and so keeps
creating and editing; the destructive half is now the platform's.

Nothing here hardcodes a role in application code — a superadmin can tick
`patients.delete` for a hospital admin from the Roles screen and it takes
effect on the next request, with no deploy.

Deliberately NOT included: schedule blocks, video slots, FCM tokens and
hospital logo/letterhead. Those are people removing their own things (a doctor
clearing their own availability), not record deletion, and they stay with
their current holders.

Departments and roles are already superadmin-only via `departments.manage`
(d7a2c5f81e64) and `roles.manage`, so they need no new row.

Revision ID: x9y0z1a2b3c4
Revises: y0z1a2b3c4d5
Create Date: 2026-08-26
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'x9y0z1a2b3c4'
down_revision: Union[str, None] = 'y0z1a2b3c4d5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# (code, label, description, resource, action, module, supports_scope, sort_order)
# sort_order sits just after the module's own manage/record row so the Roles
# matrix groups them together.
NEW_PERMISSIONS = [
    ("users.delete", "Delete users", "Permanently remove user accounts.",
     "users", "delete", None, False, 111),
    ("patients.delete", "Delete patients", "Permanently remove patient records.",
     "patients", "delete", None, False, 131),
    ("doctors.delete", "Delete doctors", "Permanently remove doctor records.",
     "doctors", "delete", None, False, 151),
    ("appointments.delete", "Delete appointments", "Permanently remove appointments.",
     "appointments", "delete", None, False, 221),
    ("vitals.delete", "Delete vitals", "Permanently remove recorded vitals.",
     "vitals", "delete", "nursing", False, 301),
    ("prescriptions.delete", "Delete prescriptions", "Permanently remove prescriptions.",
     "prescriptions", "delete", "pharmacy", False, 341),
    ("medicines.delete", "Delete medicines", "Permanently remove catalog medicines.",
     "medicines", "delete", "pharmacy", False, 351),
    ("lab_orders.delete", "Delete lab orders", "Permanently remove lab test orders.",
     "lab_orders", "delete", "lab", False, 521),
    ("lab_tests.delete", "Delete lab tests", "Permanently remove catalog lab tests.",
     "lab_tests", "delete", "lab", False, 541),
]

# The catalog said these grants covered removal. They no longer do.
DESCRIPTION_FIXES = [
    ("users.manage", "Create and edit user accounts."),
    ("patients.manage", "Create and edit patient records."),
    ("doctors.manage", "Add, edit and verify doctors."),
    ("appointments.manage", "Reschedule, cancel and complete appointments."),
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
        # Scope is NULL: deletion is not an own/all question here, and the
        # superadmin has no hospital to scope against.
        conn.execute(
            sa.text(
                "INSERT INTO role_permissions (role_code, permission_code, scope) "
                "VALUES ('superadmin', :code, NULL) ON CONFLICT DO NOTHING"
            ),
            {"code": row[0]},
        )
    for code, description in DESCRIPTION_FIXES:
        conn.execute(
            sa.text("UPDATE permissions SET description = :d WHERE code = :c"),
            {"d": description, "c": code},
        )


def downgrade() -> None:
    conn = op.get_bind()
    for row in NEW_PERMISSIONS:
        # role_permissions cascades on the permissions FK, but be explicit.
        conn.execute(
            sa.text("DELETE FROM role_permissions WHERE permission_code = :c"),
            {"c": row[0]},
        )
        conn.execute(sa.text("DELETE FROM permissions WHERE code = :c"), {"c": row[0]})
    for code, _ in DESCRIPTION_FIXES:
        conn.execute(
            sa.text("UPDATE permissions SET description = :d WHERE code = :c"),
            {"d": "Create, edit and remove records.", "c": code},
        )
