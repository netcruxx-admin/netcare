"""grant admins billing and nurses medical records

The enforcement pass reproduced the old UI exactly, which meant hospital admins
could not see billing and nurses could not see clinical notes — both artefacts of
which screens happened to exist, not decisions anyone had made. Granted here
because they are decisions about who does what, not about how the code works.

Revision ID: b8a41c92de07
Revises: d5f0c81e7a39
Create Date: 2026-07-31 16:05:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b8a41c92de07'
down_revision: Union[str, None] = 'd5f0c81e7a39'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# role -> [(permission, scope)]
GRANTS = {
    # Billing is a hospital-administration job. Vitals are recorded by whoever
    # is with the patient — the appointment screen has always offered this to
    # doctors and admins, so the seed under-granted it to nurses alone.
    "admin": [("payments.read", "all"), ("payments.manage", None), ("vitals.record", None)],
    "doctor": [("vitals.record", None)],
    # Nurses read clinical notes for the patients they already work with; the
    # narrower "write" permission is deliberately not granted.
    "nurse": [("medical_records.read", "all")],
}


def upgrade() -> None:
    role_permissions = sa.table(
        'role_permissions',
        sa.column('role_code', sa.String), sa.column('permission_code', sa.String),
        sa.column('scope', sa.String),
    )
    op.bulk_insert(role_permissions, [
        {"role_code": role, "permission_code": code, "scope": scope}
        for role, grants in GRANTS.items()
        for code, scope in grants
    ])


def downgrade() -> None:
    role_permissions = sa.table(
        'role_permissions',
        sa.column('role_code', sa.String), sa.column('permission_code', sa.String),
    )
    for role, grants in GRANTS.items():
        for code, _scope in grants:
            op.execute(
                role_permissions.delete().where(
                    sa.and_(
                        role_permissions.c.role_code == role,
                        role_permissions.c.permission_code == code,
                    )
                )
            )
