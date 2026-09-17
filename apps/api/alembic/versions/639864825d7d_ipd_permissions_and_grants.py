"""IPD: permission catalog + role grants

Migration 5 of the IPD plan (see docs/IPD_MODULE_CHANGELOG.md). Every row here
carries module='ipd', so effective_permissions() (app/authz.py) drops all of
them for any hospital whose modules.ipd is not true — which is every hospital
that exists today, the live maternity one included. Inserting these rows does
not change what any current user can do; only turning the module on for a
specific hospital would, and this migration does not do that.

Scope follows the same shape appointments.read/manage already uses: admin (and
receptionist, for the front-desk-facing pieces) hold "all", a doctor holds
"own" so they only see/act on admissions they are the attending doctor for
(see admissions.doctor_id and the own_patients_filter fix from the previous
step), nurse holds "all" for the ward-facing pieces. wards.manage/beds.manage/
beds.read carry no scope dimension, same as inventory.manage/inventory.read.

No separate discharge_summaries.write: closing a stay is one action — creating
the DischargeSummary *is* the discharge — so admissions.discharge is what gates
that endpoint; discharge_summaries carries only .read, for viewing one already
written. progress_notes.write is doctor-only (own) plus superadmin: a progress
note is a ward-round note with a doctor_id on it, the IPD counterpart of
MedicalRecord (also doctor-only) — nurses hold progress_notes.read to see
context, but their own charting is vitals/intake-output, not this table.

Revision ID: 639864825d7d
Revises: e21ce148a645
Create Date: 2026-09-15 00:25:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '639864825d7d'
down_revision: Union[str, None] = 'e21ce148a645'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# ---------------------------------------------------------------------------
# New permissions
# code, label, description, resource, action, module, supports_scope, sort_order
# ---------------------------------------------------------------------------
NEW_PERMISSIONS = [
    ('wards.manage', 'Manage wards', 'Create, edit and retire hospital wards.',
     'wards', 'manage', 'ipd', False, 1000),
    ('beds.manage', 'Manage beds', 'Create, edit and retire beds within a ward.',
     'beds', 'manage', 'ipd', False, 1010),
    ('beds.read', 'View beds', 'See bed availability and status across wards.',
     'beds', 'read', 'ipd', False, 1020),
    ('admissions.read', 'View admissions', 'See IPD admissions.',
     'admissions', 'read', 'ipd', True, 1030),
    ('admissions.create', 'Admit a patient', 'Open a new IPD admission and assign a bed.',
     'admissions', 'create', 'ipd', True, 1040),
    ('admissions.manage', 'Manage admissions',
     "Edit an admission's clinical details and transfer its bed/ward.",
     'admissions', 'manage', 'ipd', True, 1050),
    ('admissions.discharge', 'Discharge a patient',
     'Close an admission and finalize its discharge summary.',
     'admissions', 'discharge', 'ipd', True, 1060),
    ('progress_notes.read', 'View progress notes', 'Read ward-round notes for an admission.',
     'progress_notes', 'read', 'ipd', True, 1070),
    ('progress_notes.write', 'Write progress notes', 'Add a ward-round note to an admission.',
     'progress_notes', 'write', 'ipd', True, 1080),
    ('discharge_summaries.read', 'View discharge summaries', "Read a stay's discharge summary.",
     'discharge_summaries', 'read', 'ipd', True, 1090),
    ('ipd_billing.read', 'View IPD billing', "See a stay's running bill and charge items.",
     'ipd_billing', 'read', 'ipd', True, 1110),
    ('ipd_billing.manage', 'Manage IPD billing', "Add charge items and settle a stay's bill.",
     'ipd_billing', 'manage', 'ipd', True, 1120),
]

# ---------------------------------------------------------------------------
# Grants: (role_code, permission_code, scope)
# ---------------------------------------------------------------------------
NEW_GRANTS = [
    # admin — hospital-wide, "all" wherever the permission has scope
    ('admin', 'wards.manage', None),
    ('admin', 'beds.manage', None),
    ('admin', 'beds.read', None),
    ('admin', 'admissions.read', 'all'),
    ('admin', 'admissions.create', 'all'),
    ('admin', 'admissions.manage', 'all'),
    ('admin', 'admissions.discharge', 'all'),
    ('admin', 'progress_notes.read', 'all'),
    ('admin', 'discharge_summaries.read', 'all'),
    ('admin', 'ipd_billing.read', 'all'),
    ('admin', 'ipd_billing.manage', 'all'),

    # doctor — "own": the attending doctor's admissions only (Admission.doctor_id)
    ('doctor', 'beds.read', None),
    ('doctor', 'admissions.read', 'own'),
    ('doctor', 'admissions.create', 'own'),
    ('doctor', 'admissions.manage', 'own'),
    ('doctor', 'admissions.discharge', 'own'),
    ('doctor', 'progress_notes.read', 'own'),
    ('doctor', 'progress_notes.write', 'own'),
    ('doctor', 'discharge_summaries.read', 'own'),

    # nurse — ward-facing: sees every admission and its doctor's notes, but
    # does not author a progress note (that table is doctor_id-shaped, the
    # nurse's own charting is on Vitals — intake/output — instead)
    ('nurse', 'beds.read', None),
    ('nurse', 'admissions.read', 'all'),
    ('nurse', 'progress_notes.read', 'all'),

    # receptionist — front desk: admits, reads the bed board, handles billing
    ('receptionist', 'beds.read', None),
    ('receptionist', 'admissions.read', 'all'),
    ('receptionist', 'admissions.create', 'all'),
    ('receptionist', 'ipd_billing.read', 'all'),
    ('receptionist', 'ipd_billing.manage', 'all'),

    # patient — their own stay only
    ('patient', 'discharge_summaries.read', 'own'),
    ('patient', 'ipd_billing.read', 'own'),

    # superadmin — everything, unscoped where the permission has no scope
    # dimension, "all" where it does (same convention as every other module).
    ('superadmin', 'wards.manage', None),
    ('superadmin', 'beds.manage', None),
    ('superadmin', 'beds.read', None),
    ('superadmin', 'admissions.read', 'all'),
    ('superadmin', 'admissions.create', 'all'),
    ('superadmin', 'admissions.manage', 'all'),
    ('superadmin', 'admissions.discharge', 'all'),
    ('superadmin', 'progress_notes.read', 'all'),
    ('superadmin', 'progress_notes.write', 'all'),
    ('superadmin', 'discharge_summaries.read', 'all'),
    ('superadmin', 'ipd_billing.read', 'all'),
    ('superadmin', 'ipd_billing.manage', 'all'),
]


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
            'code': code, 'label': label, 'description': description,
            'resource': resource, 'action': action, 'module': module,
            'supports_scope': supports_scope, 'sort_order': sort_order,
        }
        for code, label, description, resource, action, module, supports_scope, sort_order in NEW_PERMISSIONS
    ])

    role_permissions = sa.table(
        'role_permissions',
        sa.column('role_code', sa.String), sa.column('permission_code', sa.String),
        sa.column('scope', sa.String),
    )
    op.bulk_insert(role_permissions, [
        {'role_code': role, 'permission_code': code, 'scope': scope}
        for role, code, scope in NEW_GRANTS
    ])


def downgrade() -> None:
    codes = [p[0] for p in NEW_PERMISSIONS]
    role_permissions = sa.table(
        'role_permissions', sa.column('permission_code', sa.String)
    )
    op.execute(role_permissions.delete().where(role_permissions.c.permission_code.in_(codes)))
    permissions = sa.table('permissions', sa.column('code', sa.String))
    op.execute(permissions.delete().where(permissions.c.code.in_(codes)))
