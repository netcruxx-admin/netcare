"""IPD: nursing_notes permission catalog + role grants

module='ipd', same reasoning as 639864825d7d — effective_permissions() drops
these for any hospital whose modules.ipd is not true, so this is inert for
every hospital that exists today, the live maternity one included.

Grants mirror progress_notes' shape but with author and reader roles
swapped: nurse reads+writes "all" (charts any patient on the ward, same scope
nurse already holds on admissions.read/progress_notes.read); doctor reads
"own" only (the attending doctor for the admission, via the new
own_nursing_notes_filter in app/ipd.py — NursingNote carries no doctor_id
column for authz.own_record_filter's generic check to find, same class of gap
own_discharge_summaries_filter already exists to fix); admin reads "all" (sees
context, does not chart — consistent with admin holding progress_notes.read
but not .write); superadmin reads+writes "all".

Revision ID: ea030916d0d3
Revises: 4d499093cf18
Create Date: 2026-09-17 00:05:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'ea030916d0d3'
down_revision: Union[str, None] = '4d499093cf18'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


NEW_PERMISSIONS = [
    ('nursing_notes.read', 'View nursing notes', "Read a stay's nursing round notes.",
     'nursing_notes', 'read', 'ipd', True, 1095),
    ('nursing_notes.write', 'Write nursing notes', 'Add a nursing round note to an admission.',
     'nursing_notes', 'write', 'ipd', True, 1100),
]

NEW_GRANTS = [
    ('admin', 'nursing_notes.read', 'all'),
    ('doctor', 'nursing_notes.read', 'own'),
    ('nurse', 'nursing_notes.read', 'all'),
    ('nurse', 'nursing_notes.write', 'all'),
    ('superadmin', 'nursing_notes.read', 'all'),
    ('superadmin', 'nursing_notes.write', 'all'),
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
    role_permissions = sa.table('role_permissions', sa.column('permission_code', sa.String))
    op.execute(role_permissions.delete().where(role_permissions.c.permission_code.in_(codes)))
    permissions = sa.table('permissions', sa.column('code', sa.String))
    op.execute(permissions.delete().where(permissions.c.code.in_(codes)))
