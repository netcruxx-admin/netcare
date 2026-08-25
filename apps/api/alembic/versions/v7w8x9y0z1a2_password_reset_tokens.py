"""add password_reset_tokens table

Short-lived, single-use tokens that let a user prove they control their
registered email address and then set a new password.  The raw token is never
stored — only its SHA-256 hash — so a database dump cannot be replayed.

Revision ID: v7w8x9y0z1a2
Revises: u6v7w8x9y0z1
Create Date: 2026-08-25
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "v7w8x9y0z1a2"
down_revision: Union[str, None] = "u6v7w8x9y0z1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "password_reset_tokens",
        sa.Column("id", sa.String(), nullable=False),
        # NULL for the platform superadmin (who has no hospital_id either).
        sa.Column("hospital_id", sa.String(), nullable=True),
        sa.Column(
            "user_id",
            sa.String(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        # SHA-256 hex digest of the raw URL token. Raw token never touches the DB.
        sa.Column("token_hash", sa.String(), nullable=False, unique=True),
        # ISO-8601 UTC; 1 hour from creation.
        sa.Column("expires_at", sa.String(), nullable=False),
        # Set when consumed; NULL means still live.
        sa.Column("used_at", sa.String(), nullable=True),
        sa.Column("created_at", sa.String(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_prt_user_id", "password_reset_tokens", ["user_id"]
    )
    op.create_index(
        "ix_prt_token_hash", "password_reset_tokens", ["token_hash"], unique=True
    )


def downgrade() -> None:
    op.drop_index("ix_prt_token_hash", table_name="password_reset_tokens")
    op.drop_index("ix_prt_user_id", table_name="password_reset_tokens")
    op.drop_table("password_reset_tokens")
