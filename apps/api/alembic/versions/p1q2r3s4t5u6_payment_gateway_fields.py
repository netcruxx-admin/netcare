"""add gateway_order_id and gateway_payment_id to payments

Online payments via Razorpay need two identifiers that were not on the table:
- gateway_order_id  — the Razorpay order created server-side at initiate time.
                      Fixes the amount so the frontend cannot alter it.
- gateway_payment_id — the Razorpay payment id from the checkout callback,
                       written only after the server verifies the HMAC signature.
                       Its presence means the payment is cryptographically confirmed.

Both are nullable because cash payments never touch Razorpay and must continue to
work without them.

Revision ID: p1q2r3s4t5u6
Revises: f3c81a05d7b2
Create Date: 2026-08-22 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "p1q2r3s4t5u6"
down_revision: Union[str, None] = "a4d9e21b6c37"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "payments",
        sa.Column("gateway_order_id", sa.String(), nullable=True),
    )
    op.add_column(
        "payments",
        sa.Column("gateway_payment_id", sa.String(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("payments", "gateway_payment_id")
    op.drop_column("payments", "gateway_order_id")
