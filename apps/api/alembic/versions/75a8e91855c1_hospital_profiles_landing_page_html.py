"""hospital_profiles: landing_page_html

A complete, hospital-authored HTML page for their own subdomain's `/`,
editable by that hospital's admin (self-service settings) or by a superadmin
(the per-hospital edit wizard and onboarding). Empty means the subdomain has
none yet, and the frontend sends `/` to `/login` instead.

Lives on HospitalProfile, not Hospital: that table is read on every request
(`scoped()` resolves the tenant from it) and is deliberately kept narrow —
this is exactly the "bulky, read once per screen" content HospitalProfile
already holds `notes`/`logo_url` for.

Security note, not enforced by this migration but by the frontend: this
string is only ever rendered inside a sandboxed iframe with no
`allow-same-origin`, since it shares an origin with the subdomain's own
session storage.

Revision ID: 75a8e91855c1
Revises: a6e02f4b8d17
Create Date: 2026-09-29 15:00:12.974496

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '75a8e91855c1'
down_revision: Union[str, None] = 'a6e02f4b8d17'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "hospital_profiles",
        sa.Column("landing_page_html", sa.Text(), nullable=False, server_default=""),
    )


def downgrade() -> None:
    op.drop_column("hospital_profiles", "landing_page_html")
