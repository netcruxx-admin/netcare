"""record who accessed which record

The EHR Standards for India 2016 adopt ISO 27789, which requires an audit trail
over every *access* to a health record, not only every change. DPDP 2023 needs
the same trail to reconstruct a breach, and the CERT-In directions of April 2022
require logs to be retained in India for 180 days. One table answers all three.

Not tenant-scoped by ForeignKey on purpose: the trail has to outlive the rows it
describes, so deleting a hospital or a patient must not cascade the evidence of
who read them away. See app/audit.py for the rest of the reasoning.

Revision ID: f7a3c02e8d41
Revises: e9f1a2b3c4d5
Create Date: 2026-08-03 09:40:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f7a3c02e8d41'
down_revision: Union[str, None] = 'e9f1a2b3c4d5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


NEW_PERMISSION = (
    "audit.read", "View the access trail",
    "See who accessed which patient record, when, and under what permission.",
    "audit", "read", None, False, 900,
)

# Scope is not a dimension here: the trail is either yours to see or it is not.
# A hospital admin sees their own hospital's trail (tenant scoping does that on
# its own); a superadmin reaches a named tenant's via X-Hospital-Id. Clinicians
# are deliberately excluded — the trail is as much personnel data about
# colleagues as it is a compliance record.
GRANTS = [("admin", None), ("superadmin", None)]


def upgrade() -> None:
    op.create_table(
        'audit_logs',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('request_id', sa.String(), nullable=False),
        sa.Column('hospital_id', sa.String(), nullable=True),
        sa.Column('actor_user_id', sa.String(), nullable=True),
        sa.Column('actor_role', sa.String(), server_default=''),
        sa.Column('actor_ip', sa.String(), server_default=''),
        sa.Column('user_agent', sa.String(), server_default=''),
        sa.Column('method', sa.String(), nullable=False),
        sa.Column('path', sa.String(), nullable=False),
        sa.Column('permission', sa.String(), server_default=''),
        sa.Column('scope', sa.String(), nullable=True),
        sa.Column('subject_type', sa.String(), server_default=''),
        sa.Column('subject_id', sa.String(), server_default=''),
        sa.Column('patient_id', sa.String(), nullable=True),
        sa.Column('action', sa.String(), nullable=False),
        sa.Column('status_code', sa.Integer(), nullable=False),
        sa.Column('outcome', sa.String(), nullable=False),
        sa.Column('detail', sa.String(), server_default=''),
        sa.Column('duration_ms', sa.Integer(), server_default='0'),
        sa.Column('created_at', sa.String(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_audit_logs_request_id', 'audit_logs', ['request_id'])
    op.create_index('ix_audit_logs_hospital_id', 'audit_logs', ['hospital_id'])
    op.create_index('ix_audit_logs_actor_user_id', 'audit_logs', ['actor_user_id'])
    op.create_index('ix_audit_logs_patient_id', 'audit_logs', ['patient_id'])
    op.create_index('ix_audit_logs_created_at', 'audit_logs', ['created_at'])
    # The composites carry the three questions the table is actually asked:
    # what happened here lately, who touched this patient, what did this user do.
    op.create_index('ix_audit_tenant_time', 'audit_logs', ['hospital_id', 'created_at'])
    op.create_index('ix_audit_patient_time', 'audit_logs', ['patient_id', 'created_at'])
    op.create_index('ix_audit_actor_time', 'audit_logs', ['actor_user_id', 'created_at'])

    permissions = sa.table(
        'permissions',
        sa.column('code', sa.String), sa.column('label', sa.String),
        sa.column('description', sa.String), sa.column('resource', sa.String),
        sa.column('action', sa.String), sa.column('module', sa.String),
        sa.column('supports_scope', sa.Boolean), sa.column('sort_order', sa.Integer),
    )
    code, label, description, resource, action, module, supports_scope, sort_order = NEW_PERMISSION
    op.bulk_insert(permissions, [{
        "code": code, "label": label, "description": description,
        "resource": resource, "action": action, "module": module,
        "supports_scope": supports_scope, "sort_order": sort_order,
    }])

    role_permissions = sa.table(
        'role_permissions',
        sa.column('role_code', sa.String), sa.column('permission_code', sa.String),
        sa.column('scope', sa.String),
    )
    op.bulk_insert(role_permissions, [
        {"role_code": role, "permission_code": code, "scope": scope}
        for role, scope in GRANTS
    ])


def downgrade() -> None:
    code = NEW_PERMISSION[0]
    role_permissions = sa.table(
        'role_permissions', sa.column('permission_code', sa.String)
    )
    op.execute(role_permissions.delete().where(role_permissions.c.permission_code == code))
    permissions = sa.table('permissions', sa.column('code', sa.String))
    op.execute(permissions.delete().where(permissions.c.code == code))
    op.drop_table('audit_logs')
