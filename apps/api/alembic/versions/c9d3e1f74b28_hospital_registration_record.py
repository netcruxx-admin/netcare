"""hospital registration record

A tenant row was enough to boot a hospital and nowhere near enough to register
one. This adds the legal identity a facility must print on an invoice or a
report (registration number, PAN, GSTIN, HFR id, NABH status) to `hospitals`
itself, and moves the bulky rest into four tables of its own:

  * hospital_profiles      — address, contacts, responsible clinician, bed
                             counts, operational config, branding assets
  * hospital_licences       — one row per statutory licence, each with its own
                             expiry, so a single query answers "what lapses this
                             month" across the platform
  * hospital_documents      — the scans backing all of the above
  * hospital_subscriptions  — the commercial terms, which are ours and not the
                             hospital's

The split is by access shape rather than tidiness: `hospitals` is read by every
tenant-scoped request, and none of those requests want forty columns of
registration detail.

`onboarding_status` is added alongside the existing `status` rather than
widening it — one says where registration got to, the other says whether the
tenant may sign in today, and collapsing them would make "verified but suspended
for non-payment" unrepresentable.

Existing rows are backfilled with a profile and a subscription so nothing
downstream has to branch on "has this hospital been profiled yet".

Revision ID: c9d3e1f74b28
Revises: b5e91c73a0d8
Create Date: 2026-08-03 12:00:00.000000

"""
from datetime import datetime, timezone
from typing import Sequence, Union
from uuid import uuid4

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c9d3e1f74b28'
down_revision: Union[str, None] = 'b5e91c73a0d8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# (column, type, server_default)
HOSPITAL_COLUMNS = [
    ("legal_name", sa.String(), ""),
    ("entity_type", sa.String(), ""),
    ("ownership", sa.String(), ""),
    ("registration_no", sa.String(), ""),
    ("registration_authority", sa.String(), ""),
    ("registration_valid_till", sa.String(), ""),
    ("pan", sa.String(), ""),
    ("gstin", sa.String(), ""),
    ("hfr_id", sa.String(), ""),
    ("nabh_status", sa.String(), "none"),
    ("nabh_valid_till", sa.String(), ""),
    # Existing tenants predate registration entirely, so they start at
    # "pending" — the honest answer, and the one that makes them show up in a
    # superadmin's "needs paperwork" filter rather than quietly passing as done.
    ("onboarding_status", sa.String(), "pending"),
    ("verified_at", sa.String(), ""),
    ("verified_by", sa.String(), ""),
    ("go_live_date", sa.String(), ""),
]


def upgrade() -> None:
    for name, type_, default in HOSPITAL_COLUMNS:
        op.add_column(
            "hospitals",
            sa.Column(name, type_, nullable=True, server_default=default),
        )
    op.create_index("ix_hospitals_onboarding_status", "hospitals", ["onboarding_status"])

    op.create_table(
        "hospital_profiles",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("hospital_id", sa.String(), nullable=False),
        # Address
        sa.Column("address_line1", sa.String(), server_default=""),
        sa.Column("address_line2", sa.String(), server_default=""),
        sa.Column("city", sa.String(), server_default=""),
        sa.Column("district", sa.String(), server_default=""),
        sa.Column("state", sa.String(), server_default=""),
        sa.Column("pincode", sa.String(), server_default=""),
        sa.Column("country", sa.String(), server_default="India"),
        sa.Column("latitude", sa.Float(), nullable=True),
        sa.Column("longitude", sa.Float(), nullable=True),
        # Contact
        sa.Column("phone_primary", sa.String(), server_default=""),
        sa.Column("phone_secondary", sa.String(), server_default=""),
        sa.Column("phone_emergency", sa.String(), server_default=""),
        sa.Column("email", sa.String(), server_default=""),
        sa.Column("website", sa.String(), server_default=""),
        # Owner / responsible clinician
        sa.Column("owner_name", sa.String(), server_default=""),
        sa.Column("owner_phone", sa.String(), server_default=""),
        sa.Column("owner_email", sa.String(), server_default=""),
        sa.Column("medical_director_name", sa.String(), server_default=""),
        sa.Column("medical_director_reg_no", sa.String(), server_default=""),
        sa.Column("medical_director_council", sa.String(), server_default=""),
        sa.Column("medical_director_qualification", sa.String(), server_default=""),
        # Clinical profile
        sa.Column("facility_type", sa.String(), server_default=""),
        sa.Column("bed_count", sa.Integer(), server_default="0"),
        sa.Column("icu_beds", sa.Integer(), server_default="0"),
        sa.Column("nicu_beds", sa.Integer(), server_default="0"),
        sa.Column("emergency_beds", sa.Integer(), server_default="0"),
        sa.Column("operation_theatres", sa.Integer(), server_default="0"),
        sa.Column("ambulance_count", sa.Integer(), server_default="0"),
        sa.Column("has_pharmacy", sa.Boolean(), server_default=sa.false()),
        sa.Column("has_lab", sa.Boolean(), server_default=sa.false()),
        sa.Column("has_radiology", sa.Boolean(), server_default=sa.false()),
        sa.Column("has_blood_bank", sa.Boolean(), server_default=sa.false()),
        sa.Column("has_emergency", sa.Boolean(), server_default=sa.false()),
        sa.Column("has_ambulance", sa.Boolean(), server_default=sa.false()),
        sa.Column("specialties", sa.JSON(), nullable=True),
        # Operations
        sa.Column("timezone", sa.String(), server_default="Asia/Kolkata"),
        sa.Column("locale", sa.String(), server_default="en-IN"),
        sa.Column("financial_year_start", sa.String(), server_default="04-01"),
        sa.Column("opd_hours", sa.JSON(), nullable=True),
        sa.Column("weekly_off", sa.JSON(), nullable=True),
        sa.Column("appointment_slot_minutes", sa.Integer(), server_default="15"),
        sa.Column("invoice_prefix", sa.String(), server_default="INV"),
        sa.Column("invoice_series_start", sa.Integer(), server_default="1"),
        sa.Column("mrn_prefix", sa.String(), server_default="MRN"),
        sa.Column("mrn_format", sa.String(), server_default="{prefix}-{seq:06d}"),
        # Branding assets
        sa.Column("logo_url", sa.String(), server_default=""),
        sa.Column("letterhead_url", sa.String(), server_default=""),
        sa.Column("signature_url", sa.String(), server_default=""),
        sa.Column("notes", sa.Text(), server_default=""),
        sa.Column("updated_at", sa.String(), server_default=""),
        sa.ForeignKeyConstraint(["hospital_id"], ["hospitals.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("hospital_id"),
    )
    op.create_index("ix_hospital_profiles_hospital_id", "hospital_profiles", ["hospital_id"])

    op.create_table(
        "hospital_licences",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("hospital_id", sa.String(), nullable=False),
        sa.Column("type", sa.String(), nullable=False),
        sa.Column("number", sa.String(), server_default=""),
        sa.Column("issuing_authority", sa.String(), server_default=""),
        sa.Column("issued_on", sa.String(), server_default=""),
        sa.Column("expires_on", sa.String(), server_default=""),
        sa.Column("status", sa.String(), server_default="pending"),
        sa.Column("document_url", sa.String(), server_default=""),
        sa.Column("notes", sa.Text(), server_default=""),
        sa.Column("created_at", sa.String(), nullable=False),
        sa.Column("updated_at", sa.String(), server_default=""),
        sa.ForeignKeyConstraint(["hospital_id"], ["hospitals.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_hospital_licences_hospital_id", "hospital_licences", ["hospital_id"])
    # The question this table is actually asked: what expires soon, platform-wide.
    op.create_index("ix_hospital_licences_expiry", "hospital_licences", ["expires_on"])

    op.create_table(
        "hospital_documents",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("hospital_id", sa.String(), nullable=False),
        sa.Column("doc_type", sa.String(), nullable=False, server_default="other"),
        sa.Column("licence_type", sa.String(), server_default=""),
        sa.Column("title", sa.String(), server_default=""),
        sa.Column("file_name", sa.String(), server_default=""),
        sa.Column("file_url", sa.String(), nullable=False),
        sa.Column("content_type", sa.String(), server_default=""),
        sa.Column("size_bytes", sa.Integer(), server_default="0"),
        sa.Column("uploaded_by", sa.String(), server_default=""),
        sa.Column("uploaded_at", sa.String(), nullable=False),
        sa.Column("notes", sa.Text(), server_default=""),
        sa.ForeignKeyConstraint(["hospital_id"], ["hospitals.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_hospital_documents_hospital_id", "hospital_documents", ["hospital_id"])

    op.create_table(
        "hospital_subscriptions",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("hospital_id", sa.String(), nullable=False),
        sa.Column("plan", sa.String(), server_default="trial"),
        sa.Column("status", sa.String(), server_default="trial"),
        sa.Column("billing_cycle", sa.String(), server_default="monthly"),
        sa.Column("price", sa.Float(), server_default="0"),
        sa.Column("currency", sa.String(), server_default="INR"),
        sa.Column("started_on", sa.String(), server_default=""),
        sa.Column("trial_ends_on", sa.String(), server_default=""),
        sa.Column("renews_on", sa.String(), server_default=""),
        sa.Column("max_users", sa.Integer(), server_default="0"),
        sa.Column("max_doctors", sa.Integer(), server_default="0"),
        sa.Column("max_beds", sa.Integer(), server_default="0"),
        sa.Column("billing_contact_name", sa.String(), server_default=""),
        sa.Column("billing_contact_email", sa.String(), server_default=""),
        sa.Column("billing_contact_phone", sa.String(), server_default=""),
        sa.Column("billing_address", sa.Text(), server_default=""),
        sa.Column("billing_gstin", sa.String(), server_default=""),
        sa.Column("notes", sa.Text(), server_default=""),
        sa.Column("created_at", sa.String(), nullable=False),
        sa.Column("updated_at", sa.String(), server_default=""),
        sa.ForeignKeyConstraint(["hospital_id"], ["hospitals.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("hospital_id"),
    )
    op.create_index(
        "ix_hospital_subscriptions_hospital_id", "hospital_subscriptions", ["hospital_id"]
    )

    _backfill_existing_tenants()


def _backfill_existing_tenants() -> None:
    """Give every pre-existing hospital a profile and a subscription row.

    Provisioning writes both from now on, so the app is entitled to assume they
    exist. Without this, exactly the tenants that were created before today
    would be the ones with a null profile — the case least likely to be tested
    and most likely to be a demo in front of someone.
    """
    connection = op.get_bind()
    now = datetime.now(timezone.utc).isoformat()
    rows = connection.execute(
        sa.text("SELECT id, currency FROM hospitals")
    ).fetchall()
    if not rows:
        return

    def fresh(prefix: str) -> str:
        return f"{prefix}-{uuid4().hex[:8]}"

    connection.execute(
        sa.text(
            "INSERT INTO hospital_profiles (id, hospital_id, updated_at) "
            "VALUES (:id, :hospital_id, :updated_at)"
        ),
        [{"id": fresh("hprof"), "hospital_id": r[0], "updated_at": now} for r in rows],
    )
    connection.execute(
        sa.text(
            "INSERT INTO hospital_subscriptions "
            "(id, hospital_id, currency, started_on, created_at, updated_at) "
            "VALUES (:id, :hospital_id, :currency, :started_on, :created_at, :updated_at)"
        ),
        [
            {
                "id": fresh("sub"),
                "hospital_id": r[0],
                "currency": r[1] or "INR",
                "started_on": now[:10],
                "created_at": now,
                "updated_at": now,
            }
            for r in rows
        ],
    )


def downgrade() -> None:
    op.drop_index("ix_hospital_subscriptions_hospital_id", table_name="hospital_subscriptions")
    op.drop_table("hospital_subscriptions")
    op.drop_index("ix_hospital_documents_hospital_id", table_name="hospital_documents")
    op.drop_table("hospital_documents")
    op.drop_index("ix_hospital_licences_expiry", table_name="hospital_licences")
    op.drop_index("ix_hospital_licences_hospital_id", table_name="hospital_licences")
    op.drop_table("hospital_licences")
    op.drop_index("ix_hospital_profiles_hospital_id", table_name="hospital_profiles")
    op.drop_table("hospital_profiles")
    op.drop_index("ix_hospitals_onboarding_status", table_name="hospitals")
    for name, _type, _default in reversed(HOSPITAL_COLUMNS):
        op.drop_column("hospitals", name)
