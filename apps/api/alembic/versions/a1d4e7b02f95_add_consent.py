"""ask before processing, and keep the proof

DPDP 2023 requires notice before collection and consent that is specific,
itemised, unconditional and withdrawable — which cannot be represented by a
boolean on the user row. Two tables: the catalog of purposes (code-owned and
versioned, like `permissions`) and one row per answer, stamped with the notice
version the person actually saw.

The purposes seeded here are the ones this codebase genuinely processes data
for. Adding a purpose without adding the processing would make the notice
misleading; adding processing without a purpose is the failure this table is
meant to make visible.

Revision ID: a1d4e7b02f95
Revises: f7a3c02e8d41
Create Date: 2026-08-03 10:25:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1d4e7b02f95'
down_revision: Union[str, None] = 'f7a3c02e8d41'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# code, label, notice, required, module, cadence, sort_order
#
# `required` is true only where care genuinely cannot be delivered without the
# processing. Everything else must be refusable while still being treated —
# that is what DPDP means by consent being unconditional, and it is why
# marketing and research are separate rows rather than clauses inside treatment.
PURPOSES = [
    (
        "treatment",
        "Providing your medical care",
        "We record your health information — symptoms, diagnoses, prescriptions, "
        "test results and vitals — so the clinicians treating you can see your "
        "history and provide safe care. This record is kept for the periods "
        "required by medical regulations even if you later stop using this "
        "hospital.",
        True, None, "per_person", 10,
    ),
    (
        "billing",
        "Billing and payments",
        "We use your details to raise invoices, take payments, and process "
        "insurance claims where you ask us to. Financial records are retained "
        "for the periods required by tax law.",
        True, None, "per_person", 20,
    ),
    (
        "communications.service",
        "Appointment reminders and results",
        "We contact you about your own appointments, test results and payments "
        "using the phone number and email you give us. These are messages about "
        "care you have asked for, not marketing.",
        True, None, "per_person", 30,
    ),
    (
        "telemedicine",
        "Video consultations",
        "When you consult a doctor by video, we process the consultation and any "
        "prescription that comes out of it. You will be asked about this each "
        "time, and you can end a consultation at any point.",
        False, "telemedicine", "per_event", 40,
    ),
    (
        "communications.marketing",
        "Health camps, offers and newsletters",
        "We may tell you about health check-up camps, new services and offers. "
        "This is entirely optional — saying no changes nothing about the care "
        "you receive, and you can withdraw it at any time.",
        False, None, "per_person", 50,
    ),
    (
        "research.anonymised",
        "Anonymised research and service improvement",
        "We may use your records with your name, contact details and other "
        "identifiers removed, to study treatment outcomes and improve our "
        "services. Nothing published from this can identify you. Optional.",
        False, None, "per_person", 60,
    ),
    (
        "abdm.linking",
        "Linking your records to your ABHA account",
        "We can link the records we hold to your Ayushman Bharat Health Account "
        "so other hospitals you choose can request them through the national "
        "consent manager. Each such request is approved by you separately. "
        "Optional.",
        False, None, "per_person", 70,
    ),
]

# code, label, description, resource, action, module, supports_scope, sort_order
PERMISSIONS = [
    (
        "consents.read", "View consent records",
        "See what a person has agreed to and when.",
        "consents", "read", None, True, 910,
    ),
    (
        "consents.manage", "Record consent",
        "Record a consent, including on a patient's behalf at the desk.",
        "consents", "manage", None, True, 920,
    ),
]

# A patient reads and records only their own. Front-desk roles record on behalf,
# which is the normal case for a walk-in. Doctors and nurses get read access
# because "may I use this for X" is a question they have to answer at the point
# of care, but they do not get to record it — the person consenting should be
# talking to the desk, not to the clinician about to treat them.
GRANTS = [
    ("patient", "consents.read", "own"),
    ("patient", "consents.manage", "own"),
    ("admin", "consents.read", "all"),
    ("admin", "consents.manage", "all"),
    ("nurse", "consents.read", "all"),
    ("nurse", "consents.manage", "all"),
    ("doctor", "consents.read", "all"),
    ("superadmin", "consents.read", "all"),
    ("superadmin", "consents.manage", "all"),
]


def upgrade() -> None:
    op.create_table(
        'consent_purposes',
        sa.Column('code', sa.String(), nullable=False),
        sa.Column('label', sa.String(), nullable=False),
        sa.Column('notice', sa.Text(), nullable=False),
        sa.Column('version', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('required', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('module', sa.String(), nullable=True),
        sa.Column('cadence', sa.String(), nullable=False, server_default='per_person'),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
        sa.PrimaryKeyConstraint('code'),
    )

    op.create_table(
        'consents',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('hospital_id', sa.String(), nullable=False),
        sa.Column('subject_user_id', sa.String(), nullable=False),
        sa.Column('purpose_code', sa.String(), nullable=False),
        sa.Column('version', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('method', sa.String(), nullable=False, server_default='explicit'),
        sa.Column('recorded_by_user_id', sa.String(), nullable=True),
        sa.Column('guardian_user_id', sa.String(), nullable=True),
        sa.Column('guardian_name', sa.String(), server_default=''),
        sa.Column('guardian_relationship', sa.String(), server_default=''),
        sa.Column('appointment_id', sa.String(), nullable=True),
        sa.Column('ip', sa.String(), server_default=''),
        sa.Column('user_agent', sa.String(), server_default=''),
        sa.Column('granted_at', sa.String(), nullable=False),
        sa.Column('withdrawn_at', sa.String(), nullable=True),
        sa.ForeignKeyConstraint(['hospital_id'], ['hospitals.id']),
        sa.ForeignKeyConstraint(['purpose_code'], ['consent_purposes.code']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_consents_hospital_id', 'consents', ['hospital_id'])
    op.create_index('ix_consents_subject_user_id', 'consents', ['subject_user_id'])
    op.create_index('ix_consents_purpose_code', 'consents', ['purpose_code'])
    op.create_index('ix_consents_appointment_id', 'consents', ['appointment_id'])
    op.create_index(
        'ix_consents_subject_purpose', 'consents', ['subject_user_id', 'purpose_code']
    )

    purposes = sa.table(
        'consent_purposes',
        sa.column('code', sa.String), sa.column('label', sa.String),
        sa.column('notice', sa.Text), sa.column('version', sa.Integer),
        sa.column('required', sa.Boolean), sa.column('module', sa.String),
        sa.column('cadence', sa.String), sa.column('sort_order', sa.Integer),
    )
    op.bulk_insert(purposes, [
        {
            "code": code, "label": label, "notice": notice, "version": 1,
            "required": required, "module": module, "cadence": cadence,
            "sort_order": sort_order,
        }
        for code, label, notice, required, module, cadence, sort_order in PURPOSES
    ])

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
        for code, label, description, resource, action, module, supports_scope, sort_order
        in PERMISSIONS
    ])

    role_permissions = sa.table(
        'role_permissions',
        sa.column('role_code', sa.String), sa.column('permission_code', sa.String),
        sa.column('scope', sa.String),
    )
    # Roles are runtime data, so a deployment may not have all of these — insert
    # only the grants whose role actually exists rather than failing the upgrade.
    conn = op.get_bind()
    existing_roles = {
        r[0] for r in conn.execute(sa.text("SELECT code FROM roles")).fetchall()
    }
    rows = [
        {"role_code": role, "permission_code": code, "scope": scope}
        for role, code, scope in GRANTS
        if role in existing_roles
    ]
    if rows:
        op.bulk_insert(role_permissions, rows)


def downgrade() -> None:
    codes = [p[0] for p in PERMISSIONS]
    role_permissions = sa.table(
        'role_permissions', sa.column('permission_code', sa.String)
    )
    op.execute(
        role_permissions.delete().where(role_permissions.c.permission_code.in_(codes))
    )
    permissions = sa.table('permissions', sa.column('code', sa.String))
    op.execute(permissions.delete().where(permissions.c.code.in_(codes)))
    op.drop_table('consents')
    op.drop_table('consent_purposes')
