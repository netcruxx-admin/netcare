"""add permissions catalog and role grants

Moves authorization off hardcoded role checks and onto permissions a superadmin
grants to roles. The catalog below is code-owned (a permission exists because a
feature was built); the grants seeded here reproduce exactly what the six
built-in roles could already do, so behaviour is unchanged on upgrade.

Revision ID: c7e93b2a1d84
Revises: a4d81f6c05b2
Create Date: 2026-07-31 09:15:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c7e93b2a1d84'
down_revision: Union[str, None] = 'a4d81f6c05b2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# code, label, description, resource, action, module, supports_scope, sort_order
PERMISSIONS = [
    # -- Platform ------------------------------------------------------------
    ("hospitals.manage", "Manage hospitals", "Onboard, configure and suspend hospitals.", "hospitals", "manage", None, False, 10),
    ("platform.read", "View platform data", "See data across every hospital.", "platform", "read", None, False, 20),
    ("roles.manage", "Manage roles", "Create roles and decide their permissions.", "roles", "manage", None, False, 30),
    # -- People --------------------------------------------------------------
    ("users.read", "View users", "See user accounts.", "users", "read", None, True, 100),
    ("users.manage", "Manage users", "Create, edit and remove user accounts.", "users", "manage", None, False, 110),
    ("patients.read", "View patients", "See patient records.", "patients", "read", None, True, 120),
    ("patients.manage", "Manage patients", "Create and edit patient records.", "patients", "manage", None, False, 130),
    ("doctors.read", "View doctors", "See the doctor directory.", "doctors", "read", None, True, 140),
    ("doctors.manage", "Manage doctors", "Add, edit and verify doctors.", "doctors", "manage", None, False, 150),
    ("profile.manage", "Manage own profile", "Edit their own account details.", "profile", "manage", None, False, 160),
    # -- Scheduling ----------------------------------------------------------
    ("appointments.read", "View appointments", "See appointments.", "appointments", "read", None, True, 200),
    ("appointments.create", "Book appointments", "Book an appointment.", "appointments", "create", None, True, 210),
    ("appointments.manage", "Manage appointments", "Reschedule, cancel and complete appointments.", "appointments", "manage", None, True, 220),
    ("schedule.read", "View schedule", "See the consulting schedule.", "schedule", "read", None, True, 230),
    ("schedule.manage", "Manage schedule", "Set availability and block slots.", "schedule", "manage", None, True, 240),
    # -- Clinical ------------------------------------------------------------
    ("vitals.record", "Record vitals", "Record patient vitals.", "vitals", "record", "nursing", False, 300),
    ("medical_records.read", "View medical records", "See diagnoses and clinical notes.", "medical_records", "read", "medicalRecords", True, 310),
    ("medical_records.manage", "Manage medical records", "Write diagnoses and clinical notes.", "medical_records", "manage", "medicalRecords", False, 320),
    ("prescriptions.read", "View prescriptions", "See prescriptions.", "prescriptions", "read", "pharmacy", True, 330),
    ("prescriptions.manage", "Manage prescriptions", "Issue and amend prescriptions.", "prescriptions", "manage", "pharmacy", False, 340),
    ("medicines.manage", "Manage medicine catalog", "Maintain the medicine catalog.", "medicines", "manage", "pharmacy", False, 350),
    ("pregnancies.read", "View pregnancies", "See antenatal records.", "pregnancies", "read", "anc", True, 360),
    ("pregnancies.manage", "Manage pregnancies", "Record antenatal visits and outcomes.", "pregnancies", "manage", "anc", False, 370),
    ("babies.read", "View newborns", "See newborn and immunisation records.", "babies", "read", "anc", True, 380),
    ("babies.manage", "Manage newborns", "Record newborn care and immunisations.", "babies", "manage", "anc", False, 390),
    ("video_consults.join", "Join video consults", "Attend a video consultation.", "video_consults", "join", "telemedicine", True, 400),
    # -- Laboratory ----------------------------------------------------------
    ("lab_orders.read", "View lab orders", "See test orders.", "lab_orders", "read", "lab", True, 500),
    ("lab_orders.create", "Order lab tests", "Raise a test order for a patient.", "lab_orders", "create", "lab", False, 510),
    ("lab_orders.process", "Process lab orders", "Collect samples and publish results.", "lab_orders", "process", "lab", False, 520),
    ("lab_reports.read", "View lab reports", "See test reports.", "lab_reports", "read", "lab", True, 530),
    ("lab_tests.manage", "Manage test catalog", "Maintain the lab test catalog.", "lab_tests", "manage", "lab", False, 540),
    # -- Hospital administration --------------------------------------------
    ("departments.read", "View departments", "See hospital departments.", "departments", "read", None, True, 600),
    ("departments.manage", "Manage departments", "Create and edit departments.", "departments", "manage", None, False, 610),
    ("hospital.settings.manage", "Manage hospital settings", "Edit branding, modules and hospital details.", "hospital", "settings.manage", None, False, 620),
    ("payments.read", "View payments", "See payments and invoices.", "payments", "read", "payments", True, 630),
    ("payments.manage", "Manage payments", "Record and reconcile payments.", "payments", "manage", "payments", False, 640),
]

# role_code -> [(permission_code, scope)]. Chosen to reproduce exactly what each
# built-in role could do before permissions existed.
GRANTS = {
    "superadmin": [
        ("hospitals.manage", None), ("platform.read", None), ("roles.manage", None),
        ("users.read", "all"), ("users.manage", None),
        ("patients.read", "all"), ("patients.manage", None),
        ("doctors.read", "all"), ("doctors.manage", None),
        ("appointments.read", "all"),
        ("departments.read", "all"), ("departments.manage", None),
    ],
    "admin": [
        ("users.read", "all"), ("users.manage", None),
        ("patients.read", "all"), ("patients.manage", None),
        ("doctors.read", "all"), ("doctors.manage", None),
        ("appointments.read", "all"), ("appointments.create", "all"), ("appointments.manage", "all"),
        ("schedule.read", "all"), ("schedule.manage", "all"),
        ("departments.read", "all"), ("departments.manage", None),
        ("medicines.manage", None), ("lab_tests.manage", None),
        ("hospital.settings.manage", None),
    ],
    "doctor": [
        ("profile.manage", None),
        ("patients.read", "own"),
        ("appointments.read", "own"), ("appointments.manage", "own"),
        ("schedule.read", "own"), ("schedule.manage", "own"),
        ("medical_records.read", "own"), ("medical_records.manage", None),
        ("prescriptions.read", "own"), ("prescriptions.manage", None),
        ("pregnancies.read", "own"), ("pregnancies.manage", None),
        ("babies.read", "own"), ("babies.manage", None),
        ("video_consults.join", "own"),
        ("lab_orders.read", "own"), ("lab_orders.create", None),
    ],
    "nurse": [
        ("profile.manage", None),
        ("patients.read", "all"),
        ("appointments.read", "all"),
        ("vitals.record", None),
    ],
    "lab": [
        ("lab_orders.read", "all"), ("lab_orders.process", None),
        ("lab_reports.read", "all"), ("lab_tests.manage", None),
    ],
    "patient": [
        ("profile.manage", None),
        ("appointments.read", "own"), ("appointments.create", "own"),
        ("schedule.read", "own"),
        ("medical_records.read", "own"),
        ("prescriptions.read", "own"),
        ("pregnancies.read", "own"), ("babies.read", "own"),
        ("video_consults.join", "own"),
        ("lab_reports.read", "own"),
        ("payments.read", "own"),
    ],
}


def upgrade() -> None:
    permissions = op.create_table(
        'permissions',
        sa.Column('code', sa.String(), nullable=False),
        sa.Column('label', sa.String(), nullable=False),
        sa.Column('description', sa.String(), nullable=True),
        sa.Column('resource', sa.String(), nullable=False),
        sa.Column('action', sa.String(), nullable=False),
        sa.Column('module', sa.String(), nullable=True),
        sa.Column('supports_scope', sa.Boolean(), nullable=False),
        sa.Column('sort_order', sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint('code'),
    )
    op.create_index(op.f('ix_permissions_resource'), 'permissions', ['resource'])

    role_permissions = op.create_table(
        'role_permissions',
        sa.Column('role_code', sa.String(), nullable=False),
        sa.Column('permission_code', sa.String(), nullable=False),
        sa.Column('scope', sa.String(), nullable=True),
        sa.ForeignKeyConstraint(['role_code'], ['roles.code'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['permission_code'], ['permissions.code'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('role_code', 'permission_code'),
    )

    op.bulk_insert(permissions, [
        {
            "code": code, "label": label, "description": description,
            "resource": resource, "action": action, "module": module,
            "supports_scope": supports_scope, "sort_order": sort_order,
        }
        for code, label, description, resource, action, module, supports_scope, sort_order in PERMISSIONS
    ])

    op.bulk_insert(role_permissions, [
        {"role_code": role, "permission_code": code, "scope": scope}
        for role, grants in GRANTS.items()
        for code, scope in grants
    ])


def downgrade() -> None:
    op.drop_table('role_permissions')
    op.drop_index(op.f('ix_permissions_resource'), table_name='permissions')
    op.drop_table('permissions')
