"""one Razorpay payment can only ever buy one appointment

/payments/verify checked the HMAC signature and then inserted, with nothing
looking for a payment that already carried the same gateway ids. A Razorpay
signature is a deterministic HMAC over `<order_id>|<payment_id>`, so it stays
valid forever — POSTing the same successful checkout response three times
produced three appointments and three `completed` payment rows against a single
real payment. Proven before this fix; the handler's docstring claimed replays
were rejected, and they were not.

The handler now returns the existing appointment when it sees a payment id it
has already recorded, which is what makes an honest retry safe: Razorpay's
callback can fire twice on a flaky connection, and a double-click must not be
punished. This index is the backstop under that check — two concurrent
verifies of the same payment race past an application-level lookup, and only
the database can settle it.

Partial, because gateway_payment_id is null for every cash payment and NULLs
are not comparable — a plain unique index would be fine on Postgres but says
less about intent.

Revision ID: t5u6v7w8x9y0
Revises: s4t5u6v7w8x9
Create Date: 2026-08-24 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 't5u6v7w8x9y0'
down_revision: Union[str, None] = 's4t5u6v7w8x9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

INDEX = "uq_payments_gateway_payment_id"


def upgrade() -> None:
    conn = op.get_bind()
    # Any duplicates already recorded are collapsed to the earliest, so the
    # index can be created. Later rows are the replays; the appointments they
    # created are left alone rather than deleted — cancelling a real booking
    # from a migration is not this file's call to make.
    conn.execute(
        sa.text(
            """
            UPDATE payments SET gateway_payment_id = NULL
            WHERE id IN (
                SELECT id FROM (
                    SELECT id, ROW_NUMBER() OVER (
                        PARTITION BY gateway_payment_id ORDER BY created_at, id
                    ) AS rn
                    FROM payments WHERE gateway_payment_id IS NOT NULL
                ) ranked WHERE rn > 1
            )
            """
        )
    )
    op.create_index(
        INDEX,
        "payments",
        ["gateway_payment_id"],
        unique=True,
        postgresql_where=sa.text("gateway_payment_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index(INDEX, table_name="payments")
