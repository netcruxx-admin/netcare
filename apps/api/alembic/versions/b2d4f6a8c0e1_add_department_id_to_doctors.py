"""add department_id to doctors

Revision ID: b2d4f6a8c0e1
Revises: a3f9b2c1d4e5
Create Date: 2026-08-17

Stores the doctor's department as a FK rather than a free-text specialization
string so that appointment filtering never relies on string equality.
The column is nullable so existing rows are not broken; new doctors should
always have it set.
"""

from alembic import op
import sqlalchemy as sa

revision: str = 'b2d4f6a8c0e1'
down_revision: str = 'a3f9b2c1d4e5'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'doctors',
        sa.Column('department_id', sa.String(), nullable=True),
    )
    op.create_foreign_key(
        'fk_doctors_department_id',
        'doctors', 'departments',
        ['department_id'], ['id'],
        ondelete='SET NULL',
    )


def downgrade() -> None:
    op.drop_constraint('fk_doctors_department_id', 'doctors', type_='foreignkey')
    op.drop_column('doctors', 'department_id')
