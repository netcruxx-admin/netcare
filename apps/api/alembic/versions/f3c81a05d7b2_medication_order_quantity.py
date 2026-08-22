"""how many units a medication order is for

Dispensing deducted exactly one unit from stock, whatever the order said. An
order for "500mg, twice daily, 5 days" — ten tablets — moved stock by one, so
inventory drifted on the very first dispense and never recovered. Everything
built on that figure (low-stock alerts, reorder levels, valuation) was wrong by
roughly an order of magnitude.

The cause was that there was nothing to deduct: dosage, frequency and duration
are free text for the label, and no column held a number. This adds one.

Existing rows get 1, which is what dispensing them would have done anyway — so
this migration changes no history, it only stops the drift from here.

Revision ID: f3c81a05d7b2
Revises: e5b73c02a94f
Create Date: 2026-08-22 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f3c81a05d7b2'
down_revision: Union[str, None] = 'e5b73c02a94f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "medication_orders",
        sa.Column("quantity", sa.Integer(), nullable=False, server_default="1"),
    )


def downgrade() -> None:
    op.drop_column("medication_orders", "quantity")
