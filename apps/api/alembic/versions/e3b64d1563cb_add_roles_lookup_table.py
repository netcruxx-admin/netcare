"""add roles lookup table

Normalizes the free-text users.role column into a `roles` lookup table.

Ordering matters: the catalog rows must be inserted before the foreign key is
created, because `users` already holds these role values and the constraint is
validated against existing rows when it is created.

Revision ID: e3b64d1563cb
Revises: b03f584e98dc
Create Date: 2026-07-28 15:24:43.854267

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e3b64d1563cb'
down_revision: Union[str, None] = 'b03f584e98dc'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# The canonical catalog. Inlined rather than imported from app.models so this
# migration keeps producing the same schema as the application evolves.
ROLES = [
    ("superadmin", "Platform Admin", "Onboards and configures hospitals across the platform.", True, 10),
    ("admin", "Hospital Admin", "Manages their hospital's doctors, patients and departments.", False, 20),
    ("doctor", "Doctor", "Sees their appointments, patients, prescriptions and lab orders.", False, 30),
    ("nurse", "Nurse", "Records vitals and coordinates appointments.", False, 40),
    ("lab", "Lab Technician", "Manages lab test orders and results.", False, 50),
    ("patient", "Patient", "Books appointments and views their records and payments.", False, 60),
]


def upgrade() -> None:
    roles_table = op.create_table(
        'roles',
        sa.Column('code', sa.String(), nullable=False),
        sa.Column('label', sa.String(), nullable=False),
        sa.Column('description', sa.String(), nullable=True),
        sa.Column('is_platform', sa.Boolean(), nullable=False),
        sa.Column('sort_order', sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint('code'),
    )

    op.bulk_insert(
        roles_table,
        [
            {
                "code": code,
                "label": label,
                "description": description,
                "is_platform": is_platform,
                "sort_order": sort_order,
            }
            for code, label, description, is_platform, sort_order in ROLES
        ],
    )

    op.create_index(op.f('ix_users_role'), 'users', ['role'], unique=False)
    op.create_foreign_key('fk_users_role_roles', 'users', 'roles', ['role'], ['code'])


def downgrade() -> None:
    op.drop_constraint('fk_users_role_roles', 'users', type_='foreignkey')
    op.drop_index(op.f('ix_users_role'), table_name='users')
    op.drop_table('roles')
