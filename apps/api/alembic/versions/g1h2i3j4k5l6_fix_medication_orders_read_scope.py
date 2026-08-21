"""fix medication_orders.read supports_scope flag

The permission was created with supports_scope=False in
a3f9b2c1d4e5, but all of its grants carry a scope ('own' for doctor,
'all' for nurse/pharmacist/superadmin). The validation in the roles
endpoint rejects any update to those roles because a non-NULL scope on
a supports_scope=False permission is an error — so editing the doctor
role always 422s.

Fix: set supports_scope=True for medication_orders.read. The existing
grants are already correct; only the flag needs to change.

Revision ID: g1h2i3j4k5l6
Revises: e8b3a1c94d72
Create Date: 2026-08-21 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'g1h2i3j4k5l6'
down_revision: Union[str, None] = 'e8b3a1c94d72'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        sa.text(
            "UPDATE permissions SET supports_scope = TRUE "
            "WHERE code = 'medication_orders.read'"
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            "UPDATE permissions SET supports_scope = FALSE "
            "WHERE code = 'medication_orders.read'"
        )
    )
