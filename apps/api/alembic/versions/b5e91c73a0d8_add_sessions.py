"""make a sign-in something the server can end

A JWT cannot be recalled. Signed for seven days it stayed valid for seven days —
after a dismissal, a password reset, or a hospital suspension. Permissions were
already immune to that because authz.py resolves them per request; identity was
not.

This adds the row the access token now points at. Ending a session becomes a
write, which takes effect on the next request instead of at token expiry.

Breaking: tokens issued before this have no `sid` claim and are rejected, so
everyone signs in once more. Accepting them instead would have left exactly the
unrevocable credential the change exists to remove.

Revision ID: b5e91c73a0d8
Revises: a1d4e7b02f95
Create Date: 2026-08-03 11:40:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b5e91c73a0d8'
down_revision: Union[str, None] = 'a1d4e7b02f95'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'sessions',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('family_id', sa.String(), nullable=False),
        sa.Column('user_id', sa.String(), nullable=False),
        sa.Column('hospital_id', sa.String(), nullable=True),
        sa.Column('refresh_token_hash', sa.String(), nullable=False),
        sa.Column('issued_at', sa.String(), nullable=False),
        sa.Column('expires_at', sa.String(), nullable=False),
        sa.Column('rotated_at', sa.String(), nullable=True),
        sa.Column('revoked_at', sa.String(), nullable=True),
        sa.Column('revoked_reason', sa.String(), server_default=''),
        sa.Column('last_used_at', sa.String(), nullable=True),
        sa.Column('ip', sa.String(), server_default=''),
        sa.Column('user_agent', sa.String(), server_default=''),
        sa.PrimaryKeyConstraint('id'),
    )
    # Unique: a refresh token is looked up by hash on every renewal, and two
    # sessions sharing one would make "which session is this?" ambiguous at
    # exactly the moment the answer matters.
    op.create_index(
        'ix_sessions_refresh_token_hash', 'sessions', ['refresh_token_hash'], unique=True
    )
    op.create_index('ix_sessions_family_id', 'sessions', ['family_id'])
    op.create_index('ix_sessions_user_id', 'sessions', ['user_id'])
    op.create_index('ix_sessions_hospital_id', 'sessions', ['hospital_id'])
    # "Cut every session this person holds" — the dismissal path.
    op.create_index('ix_sessions_user_live', 'sessions', ['user_id', 'revoked_at'])

    # Login throttling counts recent failures out of the audit trail rather than
    # a counter table, so the lockout rests on the same evidence an investigator
    # reads. This is the index that makes that count cheap.
    op.create_index(
        'ix_audit_login_failures',
        'audit_logs',
        ['action', 'actor_ip', 'created_at'],
    )


def downgrade() -> None:
    op.drop_index('ix_audit_login_failures', table_name='audit_logs')
    op.drop_table('sessions')
