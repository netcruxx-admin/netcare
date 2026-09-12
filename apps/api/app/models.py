from sqlalchemy import (
    Boolean,
    Column,
    Float,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
    and_,
)

from .database import Base

# -----------------------------------------------------------------------------
# Multi-tenant data model.
#
# Every tenant-owned row carries `hospital_id` (FK -> hospitals.id). The one
# exception is a platform `superadmin` user, who belongs to no hospital and so
# has hospital_id = NULL. Scoping is enforced at the query layer in tenancy.py
# (the server counterpart of the frontend's withTenant()/scoped() in lib/db.ts).
# -----------------------------------------------------------------------------


class Hospital(Base):
    """A tenant, and the facility's legal identity.

    Two things live here and nothing else. The *runtime* config the frontend
    used to hardcode in lib/hospitalConfig.ts (name, branding, currency, enabled
    modules, category), and the *legal* identity that has to be printed on an
    invoice or a report — registration number, PAN, GSTIN, HFR id.

    Both are read on essentially every request path (`scoped()` resolves the
    tenant, `/hospitals/current` renders the login page), so this table is
    deliberately kept narrow. The bulky registration detail — address, bed
    counts, letterheads, billing — is read once per screen at most and lives in
    HospitalProfile, HospitalLicence, HospitalDocument and
    HospitalSubscription, each on its own lifecycle.
    """

    __tablename__ = "hospitals"

    id = Column(String, primary_key=True)  # e.g. "hosp-1"
    name = Column(String, nullable=False)  # display/trading name
    subdomain = Column(String, unique=True, index=True, nullable=False)
    # maternity | multi-specialty | dental | eye | diagnostic
    # No default: the category decides which modules, departments and licences a
    # tenant is seeded with, so a row that arrived without one would silently
    # become a maternity hospital. Provisioning always names it; anything that
    # does not is a bug worth failing on.
    category = Column(String, nullable=False)
    tagline = Column(String, default="")
    currency = Column(String, default="INR")
    # Which optional feature-modules are switched on (superadmin-controlled).
    modules = Column(JSON, default=dict)
    # Branding colors {"primary": "#...", "primaryDark": "#..."}.
    theme = Column(JSON, default=dict)
    status = Column(String, default="active")  # active | suspended

    # --- Legal identity -------------------------------------------------
    # The name on the registration certificate. Distinct from `name`: "Sunrise
    # Hospital" trades under that, but invoices must carry "Sunrise Healthcare
    # Services Pvt Ltd". Blank means "same as name".
    legal_name = Column(String, default="")
    # proprietorship | partnership | llp | private_limited | public_limited
    # | trust | society | government
    entity_type = Column(String, default="")
    # private | trust | government | psu — who owns it, which is a different
    # question from how it is incorporated.
    ownership = Column(String, default="")
    # Clinical Establishments Act (or the state Nursing Home Act) registration.
    registration_no = Column(String, default="")
    registration_authority = Column(String, default="")
    registration_valid_till = Column(String, default="")  # ISO date

    # --- Tax ------------------------------------------------------------
    pan = Column(String, default="")
    gstin = Column(String, default="")

    # --- National registries / accreditation -----------------------------
    # ABDM Health Facility Registry id. Without it a record cannot be linked to
    # a patient's ABHA, so it is worth a column of its own rather than a licence
    # row: it is an identifier, not something that expires.
    hfr_id = Column(String, default="")
    # none | entry_level | full | pre_accreditation
    nabh_status = Column(String, default="none")
    nabh_valid_till = Column(String, default="")

    # --- Onboarding lifecycle -------------------------------------------
    # Where this tenant is in *registration*, which is a different axis from
    # `status` (whether it may currently log in). A hospital can be `active` and
    # still be `documents_submitted` — that is the normal case for a trial.
    # pending | documents_submitted | verified | rejected
    onboarding_status = Column(String, default="pending")
    verified_at = Column(String, default="")
    verified_by = Column(String, default="")  # superadmin user id
    go_live_date = Column(String, default="")

    created_at = Column(String, nullable=False)


class HospitalProfile(Base):
    """Everything about a facility that is registered once and read rarely.

    Split from Hospital because of access shape, not tidiness: `hospitals` is
    touched by every tenant-scoped request, and these ~40 columns are wanted
    only by the onboarding wizard, the hospital-settings screen, and whatever
    prints a letterhead. One row per hospital, created with it.
    """

    __tablename__ = "hospital_profiles"

    id = Column(String, primary_key=True)
    hospital_id = Column(
        String,
        ForeignKey("hospitals.id", ondelete="CASCADE"),
        unique=True,
        index=True,
        nullable=False,
    )

    # --- Address ---------------------------------------------------------
    address_line1 = Column(String, default="")
    address_line2 = Column(String, default="")
    city = Column(String, default="")
    district = Column(String, default="")
    state = Column(String, default="")
    pincode = Column(String, default="")
    country = Column(String, default="India")
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)

    # --- Contact ---------------------------------------------------------
    phone_primary = Column(String, default="")
    phone_secondary = Column(String, default="")
    # Kept separate from phone_primary because it is the one printed on a
    # discharge summary and dialled at 3am; it must not silently inherit the
    # reception number.
    phone_emergency = Column(String, default="")
    email = Column(String, default="")
    website = Column(String, default="")

    # --- Owner and responsible clinician ---------------------------------
    owner_name = Column(String, default="")
    owner_phone = Column(String, default="")
    owner_email = Column(String, default="")
    # The registered medical practitioner in charge. Their council registration
    # number is a statutory requirement and gets printed on reports, so it is a
    # field rather than free text.
    medical_director_name = Column(String, default="")
    medical_director_reg_no = Column(String, default="")
    medical_director_council = Column(String, default="")
    medical_director_qualification = Column(String, default="")

    # --- Clinical profile ------------------------------------------------
    # clinic | polyclinic | nursing_home | day_care | hospital | diagnostic_centre
    facility_type = Column(String, default="")
    # Deliberately NOT derived from `modules`. Modules say what the tenant
    # bought; these say what the building has. A hospital with 40 beds that has
    # not bought the IPD module is a real and normal state.
    bed_count = Column(Integer, default=0)
    icu_beds = Column(Integer, default=0)
    nicu_beds = Column(Integer, default=0)
    emergency_beds = Column(Integer, default=0)
    operation_theatres = Column(Integer, default=0)
    ambulance_count = Column(Integer, default=0)
    has_pharmacy = Column(Boolean, default=False)
    has_lab = Column(Boolean, default=False)
    has_radiology = Column(Boolean, default=False)
    has_blood_bank = Column(Boolean, default=False)
    has_emergency = Column(Boolean, default=False)
    has_ambulance = Column(Boolean, default=False)
    specialties = Column(JSON, default=list)  # list[str]

    # --- Operations ------------------------------------------------------
    timezone = Column(String, default="Asia/Kolkata")
    locale = Column(String, default="en-IN")
    financial_year_start = Column(String, default="04-01")  # MM-DD
    # {"mon": {"open": "09:00", "close": "18:00", "closed": false}, ...}
    opd_hours = Column(JSON, default=dict)
    weekly_off = Column(JSON, default=list)  # list of day keys
    appointment_slot_minutes = Column(Integer, default=15)
    # Lunch / mid-day break — HH:MM in 24-hour format, end is exclusive.
    # Slots that fall within [start, end) are blocked in the booking UI.
    lunch_break_start = Column(String, default="12:00")
    lunch_break_end = Column(String, default="14:00")
    # Patient self-booking window — HH:MM 24-hour, end exclusive. NULL means
    # unrestricted: a patient booking online may pick any open slot. Never
    # applied to receptionist/admin bookings, only to a patient booking
    # themselves.
    patient_booking_window_start = Column(String, nullable=True)
    patient_booking_window_end = Column(String, nullable=True)
    # Hospitals are opinionated about the shape of an invoice number and an MRN,
    # and both block go-live if they are wrong. `{prefix}{seq}` style tokens.
    invoice_prefix = Column(String, default="INV")
    invoice_series_start = Column(Integer, default=1)
    mrn_prefix = Column(String, default="MRN")
    mrn_format = Column(String, default="{prefix}-{seq:06d}")

    # --- Branding assets --------------------------------------------------
    logo_url = Column(String, default="")
    letterhead_url = Column(String, default="")
    signature_url = Column(String, default="")
    # The safe content box on a full-page letterhead, in millimetres from each
    # edge of an A4 page. The hospital sets these when they upload the artwork
    # (they are the only ones who know where their header band and footer end);
    # the print sheet confines everything it draws to the box they leave.
    letterhead_margin_top_mm = Column(Integer, default=48, server_default="48")
    letterhead_margin_bottom_mm = Column(Integer, default=32, server_default="32")
    letterhead_margin_left_mm = Column(Integer, default=18, server_default="18")
    letterhead_margin_right_mm = Column(Integer, default=18, server_default="18")

    notes = Column(Text, default="")
    updated_at = Column(String, default="")

    # --- Payment gateway (per-hospital Razorpay account) -----------------
    # Nullable: hospitals that have not connected a gateway use the platform
    # fallback keys (or get a 503 if those are also absent).
    razorpay_key_id = Column(String, nullable=True)
    razorpay_key_secret = Column(String, nullable=True)


class HospitalLicence(Base):
    """One statutory licence or registration held by a hospital.

    A table rather than ten nullable columns on `hospitals`, for three reasons:
    which licences apply depends on the vertical (a dental clinic has no PCPNDT
    registration, a diagnostic centre has no drug licence), every one of them
    expires and so needs the same reminder query, and a superadmin must be able
    to record a licence type the code has never heard of without a migration.
    `type` is therefore a plain string checked against the catalog in
    licences.py, not an enum in the schema.
    """

    __tablename__ = "hospital_licences"

    id = Column(String, primary_key=True)
    hospital_id = Column(
        String,
        ForeignKey("hospitals.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    # See LICENCE_TYPES in licences.py — e.g. "drug_licence", "pcpndt", "nabl".
    type = Column(String, nullable=False)
    number = Column(String, default="")
    issuing_authority = Column(String, default="")
    issued_on = Column(String, default="")  # ISO date
    expires_on = Column(String, default="")  # ISO date; "" = does not expire
    # pending | active | expired | rejected. Stored rather than computed from
    # expires_on because "we have not received it yet" and "it lapsed" are
    # different states that both mean "not usable".
    status = Column(String, default="pending")
    # The scan proving it. Points at a HospitalDocument.file_url rather than a
    # FK, so a licence can cite a document that was uploaded before it.
    document_url = Column(String, default="")
    notes = Column(Text, default="")
    created_at = Column(String, nullable=False)
    updated_at = Column(String, default="")

    __table_args__ = (
        Index("ix_hospital_licences_expiry", "expires_on"),
    )


class HospitalDocument(Base):
    """A file uploaded as part of a hospital's registration.

    Metadata only — the bytes live wherever `file_url` points (local disk in
    dev, object storage in production). Separate from HospitalLicence because
    not every document proves a licence: a rent agreement, a board resolution
    and a cancelled cheque are all registration evidence with no expiry.
    """

    __tablename__ = "hospital_documents"

    id = Column(String, primary_key=True)
    hospital_id = Column(
        String,
        ForeignKey("hospitals.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    # See DOCUMENT_TYPES in licences.py — "registration_certificate", "pan_card",
    # "gst_certificate", "licence" (paired with licence_type), "other".
    doc_type = Column(String, nullable=False, default="other")
    # When doc_type == "licence", which licence this is the scan of.
    licence_type = Column(String, default="")
    title = Column(String, default="")
    file_name = Column(String, default="")
    file_url = Column(String, nullable=False)
    content_type = Column(String, default="")
    size_bytes = Column(Integer, default=0)
    uploaded_by = Column(String, default="")  # user id
    uploaded_at = Column(String, nullable=False)
    notes = Column(Text, default="")


class HospitalSubscription(Base):
    """The commercial relationship between the platform and one tenant.

    Ours, not theirs — no hospital user should ever be able to write this, and
    it is the one hospital-shaped table whose lifecycle is billing's rather than
    the facility's. Kept off `hospitals` so a plan change or a renewal write
    never touches the row every tenant-scoped request reads.
    """

    __tablename__ = "hospital_subscriptions"

    id = Column(String, primary_key=True)
    hospital_id = Column(
        String,
        ForeignKey("hospitals.id", ondelete="CASCADE"),
        unique=True,
        index=True,
        nullable=False,
    )
    plan = Column(String, default="trial")  # trial | basic | standard | enterprise
    # trial | active | past_due | cancelled | expired
    status = Column(String, default="trial")
    billing_cycle = Column(String, default="monthly")  # monthly | quarterly | annual
    price = Column(Float, default=0.0)
    currency = Column(String, default="INR")
    started_on = Column(String, default="")
    trial_ends_on = Column(String, default="")
    renews_on = Column(String, default="")
    # Seat/scale ceilings. 0 means "unmetered" — an explicit sentinel, because
    # NULL here would read as "unknown" and a limit that is unknown must not be
    # enforced as zero.
    max_users = Column(Integer, default=0)
    max_doctors = Column(Integer, default=0)
    max_beds = Column(Integer, default=0)
    billing_contact_name = Column(String, default="")
    billing_contact_email = Column(String, default="")
    billing_contact_phone = Column(String, default="")
    billing_address = Column(Text, default="")
    billing_gstin = Column(String, default="")
    notes = Column(Text, default="")
    created_at = Column(String, nullable=False)
    updated_at = Column(String, default="")


class Role(Base):
    """The catalog of user roles.

    A lookup table rather than a free-text column so `users.role` gains
    referential integrity and the UI has one source for display names. This is
    deliberately NOT tenant-scoped: every hospital uses the same catalog, and
    roles are managed at runtime by a superadmin (see routers/roles.py) rather
    than by migration.

    Because the catalog is dynamic, `home_path` is what keeps the frontend
    honest: the role itself declares which dashboard its users land on, so
    adding a role no longer requires editing a redirect chain in the UI.
    """

    __tablename__ = "roles"

    # The stable identifier stored on users.role — "admin", "doctor", ...
    # Also the PK, so the FK reads naturally and needs no extra join to resolve.
    code = Column(String, primary_key=True)
    label = Column(String, nullable=False)  # display name, e.g. "Hospital Admin"
    description = Column(String, default="")
    # True for platform-level roles that belong to no hospital (superadmin),
    # mirroring the users.hospital_id IS NULL case.
    is_platform = Column(Boolean, nullable=False, default=False)
    # Ascending display order for role pickers.
    sort_order = Column(Integer, nullable=False, default=0)
    # Where users of this role land after login. Note this is NOT derivable from
    # `code` — superadmin lands on /dashboard/platform. Empty means "no dedicated
    # dashboard", and the frontend falls back to a generic landing page.
    home_path = Column(String, nullable=False, default="")


class Permission(Base):
    """One thing a user can be allowed to do.

    The catalog is code-owned and finite: a permission exists because a feature
    was built for it, so it arrives by migration. Who *holds* a permission is
    pure data (see RolePermission) and is entirely the superadmin's call.

    `module` ties a permission to a purchased feature. A hospital whose `modules`
    has that flag off cannot grant it to anyone, whatever their role says — which
    is what keeps the UI and the API from ever disagreeing about a tenant's plan.
    """

    __tablename__ = "permissions"

    # "resource.action", e.g. "patients.read". Deliberately no scope in the code:
    # scope varies per grant (a doctor reads their own patients, an admin reads
    # all of them) and so belongs on RolePermission, not here.
    code = Column(String, primary_key=True)
    label = Column(String, nullable=False)
    description = Column(String, default="")
    # Split out so the UI can group the permission matrix by resource.
    resource = Column(String, nullable=False, index=True)
    action = Column(String, nullable=False)
    # Hospital module this depends on (None = always available).
    module = Column(String, nullable=True)
    # Whether "own vs all" is meaningful for this permission.
    supports_scope = Column(Boolean, nullable=False, default=False)
    sort_order = Column(Integer, nullable=False, default=0)


class RolePermission(Base):
    """A grant: this role holds this permission, at this breadth.

    The whole role/permission decision surface lives in this table, so changing
    what a role can do is a data write by a superadmin — never a deploy.
    """

    __tablename__ = "role_permissions"

    role_code = Column(String, ForeignKey("roles.code", ondelete="CASCADE"), primary_key=True)
    permission_code = Column(
        String, ForeignKey("permissions.code", ondelete="CASCADE"), primary_key=True
    )
    # "own" | "all" | None (when the permission has no scope dimension). This is
    # what distinguishes a doctor from an admin without either being named here.
    scope = Column(String, nullable=True)


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True)
    # NULL only for a platform superadmin; every tenant user has a hospital_id.
    hospital_id = Column(String, ForeignKey("hospitals.id", ondelete="CASCADE"), index=True, nullable=True)
    # Optional (see /auth login): a phone number works just as well to sign in.
    # Not nullable — "not given" is "", the same convention `phone` uses —
    # because an account must have at least one of the two, and comparing
    # against a real NULL rather than "" would complicate every place that
    # already treats an empty string as "not given".
    email = Column(String, index=True, nullable=False, default="")
    password = Column(String, nullable=False)  # bcrypt hash
    name = Column(String, nullable=False)
    phone = Column(String, default="")
    # superadmin | admin | doctor | nurse | lab | patient (see Role above)
    role = Column(String, ForeignKey("roles.code"), index=True, nullable=False)
    # Set when someone else chose this password — an admin reset, or the initial
    # password a staff account was provisioned with. The holder must replace it
    # before doing anything else, because until they do, their password is known
    # to whoever typed it and the audit trail cannot honestly attribute their
    # actions to them.
    must_change_password = Column(Boolean, nullable=False, default=False)
    created_at = Column(String, nullable=False)

    __table_args__ = (
        # Email is unique per tenant (the same person can exist at two
        # hospitals), and globally unique among platform users (NULL tenant).
        # Partial on "hospital_id is not null" for the Postgres-treats-NULLs-
        # as-distinct reason, and *also* partial on "email <> ''" — like
        # `uq_patients_tenant_aadhaar` — because email is optional now, and
        # "not given" must stay repeatable across as many accounts as have
        # none.
        Index(
            "uq_users_tenant_email",
            "hospital_id",
            "email",
            unique=True,
            postgresql_where=and_(Column("hospital_id").isnot(None), Column("email") != ""),
        ),
        Index(
            "uq_users_platform_email",
            "email",
            unique=True,
            postgresql_where=and_(Column("hospital_id").is_(None), Column("email") != ""),
        ),
    )


class FcmToken(Base):
    __tablename__ = "fcm_tokens"

    id = Column(String, primary_key=True)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    token = Column(String, unique=True, nullable=False)
    device_label = Column(String, default="")
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id = Column(String, primary_key=True)
    # NULL for the platform superadmin, who has no hospital_id.
    hospital_id = Column(String, nullable=True)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    # SHA-256 hex digest only — raw token lives only in the email.
    token_hash = Column(String, unique=True, nullable=False)
    # ISO-8601 UTC; 1 hour from creation.
    expires_at = Column(String, nullable=False)
    # Set when consumed; NULL means still usable.
    used_at = Column(String, nullable=True)
    created_at = Column(String, nullable=False)


class Patient(Base):
    __tablename__ = "patients"

    id = Column(String, primary_key=True)
    hospital_id = Column(String, ForeignKey("hospitals.id", ondelete="CASCADE"), index=True, nullable=False)
    user_id = Column(String, index=True, nullable=False)
    phone = Column(String, default="")
    date_of_birth = Column(String, default="")
    gender = Column(String, default="")
    blood_group = Column(String, default="")
    # The "W/O … / D/O … / B/O …" line that identifies a patient by a relative,
    # the common convention on Indian records. relation_type is one of
    # "wife_of" | "daughter_of" | "baby_of" (or "" when not given);
    # relation_name is that relative's name.
    relation_type = Column(String, default="")
    relation_name = Column(String, default="")
    allergies = Column(Text, default="")
    chronic_diseases = Column(Text, default="")
    emergency_contact = Column(String, default="")
    emergency_phone = Column(String, default="")
    # How the emergency contact is related to the patient, e.g. "Spouse".
    emergency_relationship = Column(String, default="")
    medical_history = Column(Text, default="")
    insurance_provider = Column(String, default="")
    insurance_number = Column(String, default="")
    documents = Column(JSON, default=list)
    # Government identity. Optional on purpose: a hospital may not refuse care
    # for want of an Aadhaar, and a walk-in emergency has no paperwork at all.
    # Validated (12 digits, Verhoeff) rather than merely stored — see
    # app/identity.py — because its only operational use is matching a person
    # to a record they already have, and a mistyped number matches nothing.
    aadhaar_number = Column(String, default="")
    # Where the patient lives. Same column names as hospital_profiles so one
    # address form, and one Google Places autocomplete, serves both.
    address_line1 = Column(String, default="")
    address_line2 = Column(String, default="")
    city = Column(String, default="")
    district = Column(String, default="")
    state = Column(String, default="")
    pincode = Column(String, default="")
    country = Column(String, default="India")

    __table_args__ = (
        # The same person cannot be registered twice at one hospital, which is
        # the reason to collect the number at all. Partial, because the empty
        # string is "not given" and any number of records may not give it.
        Index(
            "uq_patients_tenant_aadhaar",
            "hospital_id",
            "aadhaar_number",
            unique=True,
            postgresql_where=Column("aadhaar_number") != "",
        ),
    )


class Doctor(Base):
    __tablename__ = "doctors"

    id = Column(String, primary_key=True)
    hospital_id = Column(String, ForeignKey("hospitals.id", ondelete="CASCADE"), index=True, nullable=False)
    user_id = Column(String, index=True, nullable=False)
    department_id = Column(String, ForeignKey("departments.id", ondelete="SET NULL"), nullable=True)
    qualification = Column(Text, default="")
    specialization = Column(String, default="")
    experience_years = Column(Integer, default=0)
    # No consultation_fee here on purpose. What a consultation costs is the
    # hospital's price for a *kind of visit*, not an attribute of the person
    # giving it — see ConsultationFee. Pricing per doctor made every new hire a
    # pricing decision and let a doctor edit their own price from their profile.
    available_slots = Column(JSON, default=list)
    # Medical-council credentials (collected at self-registration).
    license_number = Column(String, default="")
    medical_council = Column(String, default="")
    registration_year = Column(String, default="")
    # 'verified' for seeded doctors; self-registered start 'pending'.
    verification_status = Column(String, default="verified")


class ConsultationFee(Base):
    """What a hospital charges for a kind of visit.

    One row per visit type per hospital: "New Patient" ₹600, "Follow-up" ₹300.
    The booking flow names a `visit_type` and the server reads the amount from
    here, so the price is never a number the browser sent — the same guarantee
    the per-doctor fee gave, without pricing people.

    `visit_type` is the stable key (appointments store the slug); `label` is what
    staff see and may be reworded without rewriting history. Rows are
    deactivated rather than deleted when a hospital stops offering a visit type,
    so past appointments still resolve to the price they were booked at.
    """

    __tablename__ = "consultation_fees"

    id = Column(String, primary_key=True)
    hospital_id = Column(String, ForeignKey("hospitals.id", ondelete="CASCADE"), index=True, nullable=False)
    visit_type = Column(String, nullable=False)
    label = Column(String, nullable=False)
    amount = Column(Float, nullable=False, default=0)
    active = Column(Boolean, nullable=False, default=True)
    sort_order = Column(Integer, nullable=False, default=0)
    created_at = Column(String, nullable=False)

    __table_args__ = (
        # A hospital prices each visit type once.
        UniqueConstraint("hospital_id", "visit_type", name="uq_consultation_fees_tenant_type"),
    )


class Department(Base):
    __tablename__ = "departments"

    id = Column(String, primary_key=True)
    hospital_id = Column(String, ForeignKey("hospitals.id", ondelete="CASCADE"), index=True, nullable=False)
    name = Column(String, nullable=False)
    description = Column(Text, default="")


class Appointment(Base):
    __tablename__ = "appointments"

    id = Column(String, primary_key=True)
    hospital_id = Column(String, ForeignKey("hospitals.id", ondelete="CASCADE"), index=True, nullable=False)
    patient_id = Column(String, index=True, nullable=False)
    doctor_id = Column(String, index=True, nullable=False)
    department_id = Column(String, nullable=False)
    date = Column(String, nullable=False)
    time = Column(String, nullable=False)
    status = Column(String, default="scheduled")  # scheduled | completed | cancelled
    mode = Column(String, default="in-person")  # in-person | video
    reason = Column(Text, default="")
    notes = Column(Text, default="")
    # Which published price this visit is billed at — the slug of a
    # ConsultationFee row (new | follow_up | emergency, plus anything the
    # hospital adds). The client names the kind of visit; the server prices it.
    # Kept as a slug rather than an FK so deleting a price row cannot orphan the
    # history of what a past visit was booked as.
    visit_type = Column(String, nullable=False, server_default="new", default="new")
    # Set when booked as a follow-up to an earlier appointment.
    follow_up_of = Column(String, nullable=True)
    # Raised by the server when a booked date/time is moved — a fact about what
    # happened, so it is never taken from the request body.
    rescheduled = Column(Boolean, default=False, nullable=False)
    created_at = Column(String, nullable=False)


class MedicalRecord(Base):
    __tablename__ = "medical_records"

    id = Column(String, primary_key=True)
    hospital_id = Column(String, ForeignKey("hospitals.id", ondelete="CASCADE"), index=True, nullable=False)
    patient_id = Column(String, index=True, nullable=False)
    appointment_id = Column(String, index=True, nullable=False)
    doctor_id = Column(String, nullable=False)
    diagnosis = Column(Text, default="")
    # Free-text clinical advice. `treatment_advice` was previously named
    # `prescription` — a misnomer, since actual drug orders live in the
    # Prescription table — and is renamed here without losing its data.
    treatment_advice = Column(Text, default="")
    follow_up_advice = Column(Text, default="")
    lab_reports = Column(JSON, default=list)
    # New-visit history-taking, collected once at the first encounter rather
    # than re-asked every follow-up. All optional and blank for a follow-up
    # note, which only ever fills diagnosis/treatment_advice/follow_up_advice.
    chief_complaint = Column(Text, default="")
    medical_history = Column(Text, default="")
    surgical_history = Column(Text, default="")
    family_history = Column(Text, default="")
    # LMP itself lives only on Vitals (it already derives EDD/POG from it) —
    # duplicating it here would let the two disagree. `pog_by_scan` is
    # deliberately separate from that LMP-derived POG: ultrasound and LMP
    # dating often disagree, and the gap between them is itself a finding.
    menstrual_history = Column(Text, default="")
    marital_status = Column(String, default="")
    obstetric_history = Column(Text, default="")
    pog_by_scan = Column(String, default="")
    # Examination findings — recorded at every antenatal visit, not just the
    # first, so these are not part of the new-visit-only history above.
    per_abdomen = Column(Text, default="")
    per_speculum = Column(Text, default="")
    per_vaginum = Column(Text, default="")
    created_at = Column(String, nullable=False)


class Payment(Base):
    __tablename__ = "payments"

    id = Column(String, primary_key=True)
    hospital_id = Column(String, ForeignKey("hospitals.id", ondelete="CASCADE"), index=True, nullable=False)
    # appointment_id is nullable: pharmacy and lab payments are not tied to an appointment.
    appointment_id = Column(String, index=True, nullable=True)
    # medication_order_id is set for pharmacy billing.
    medication_order_id = Column(String, index=True, nullable=True)
    # injection_order_id is set for injectable billing, test_order_id for lab billing.
    injection_order_id = Column(String, index=True, nullable=True)
    test_order_id = Column(String, index=True, nullable=True)
    patient_id = Column(String, index=True, nullable=False)
    amount = Column(Float, nullable=False)
    # consultation | pharmacy | lab | injectable
    payment_type = Column(String, default="consultation")
    status = Column(String, default="pending")  # pending | completed | failed
    payment_method = Column(String, default="")  # cash | razorpay
    # Gateway fields — only populated for online (Razorpay) payments.
    # gateway_order_id is written at initiate time (server-created Razorpay order).
    # gateway_payment_id is written at verify time (Razorpay payment id from the
    # checkout callback), and the presence of both confirms the signature was checked.
    gateway_order_id = Column(String, nullable=True)
    gateway_payment_id = Column(String, nullable=True)
    created_at = Column(String, nullable=False)


class Prescription(Base):
    __tablename__ = "prescriptions"

    id = Column(String, primary_key=True)
    hospital_id = Column(String, ForeignKey("hospitals.id", ondelete="CASCADE"), index=True, nullable=False)
    appointment_id = Column(String, index=True, nullable=False)
    patient_id = Column(String, index=True, nullable=False)
    doctor_id = Column(String, nullable=False)
    medicine_name = Column(String, default="")
    dosage = Column(String, default="")
    frequency = Column(String, default="")
    duration = Column(String, default="")
    instructions = Column(Text, default="")
    created_at = Column(String, nullable=False)


class Vitals(Base):
    __tablename__ = "vitals"

    id = Column(String, primary_key=True)
    hospital_id = Column(String, ForeignKey("hospitals.id", ondelete="CASCADE"), index=True, nullable=False)
    appointment_id = Column(String, index=True, nullable=False)
    patient_id = Column(String, index=True, nullable=False)
    doctor_id = Column(String, nullable=False)
    temperature = Column(Float, default=0)
    blood_pressure = Column(String, default="")
    heart_rate = Column(Integer, default=0)
    # Still stored so historical rows keep their data, but no longer captured by
    # the counter's vitals form.
    respiratory_rate = Column(Integer, default=0)
    weight = Column(Float, default=0)
    height = Column(Float, default=0)
    # Derived-but-editable: BMI from height/weight, and the obstetric triad —
    # last menstrual period, expected date of delivery, period of gestation
    # ("28w 3d"). Auto-filled by the form from LMP / height+weight, then
    # overridable by the recorder.
    bmi = Column(Float, default=0)
    lmp = Column(String, default="")  # ISO date
    edd = Column(String, default="")  # ISO date
    pog = Column(String, default="")
    # "" (not asked/unknown) | "pregnant" | "not_pregnant" | "menopause".
    # Gates whether EDD/POG are meaningful at all: LMP alone does not imply
    # pregnancy, and a blank LMP does not imply menopause — both used to be
    # silently inferred from the LMP field, which is wrong on both counts.
    pregnancy_status = Column(String, default="")
    notes = Column(Text, default="")
    created_at = Column(String, nullable=False)


# -----------------------------------------------------------------------------
# Catalog — pharmacy + diagnostics offerings, seeded per hospital.
# -----------------------------------------------------------------------------


class Medicine(Base):
    __tablename__ = "medicines"

    id = Column(String, primary_key=True)
    hospital_id = Column(String, ForeignKey("hospitals.id", ondelete="CASCADE"), index=True, nullable=False)
    name = Column(String, nullable=False)
    category = Column(String, default="")
    form = Column(String, default="")
    strength = Column(String, default="")
    price = Column(Float, default=0)
    stock = Column(Integer, default=0)
    lot_number = Column(String, default="")
    expiry_date = Column(String, default="")
    reorder_level = Column(Integer, default=10)
    location = Column(String, default="")
    unit = Column(String, default="")


class MedicationOrder(Base):
    __tablename__ = "medication_orders"

    id = Column(String, primary_key=True)
    hospital_id = Column(String, ForeignKey("hospitals.id", ondelete="CASCADE"), index=True, nullable=False)
    # Nullable: orders may be raised directly (ward round, OTC) without an appointment.
    appointment_id = Column(String, index=True, nullable=True)
    patient_id = Column(String, index=True, nullable=False)
    doctor_id = Column(String, nullable=False)
    # The prescription this order was raised from, when it came from one. Null
    # for an order raised directly (a ward round, an over-the-counter hand-out).
    prescription_id = Column(String, index=True, nullable=True)
    medicine_id = Column(String, nullable=True)
    medicine_name = Column(String, default="")
    # How many units to hand over. Dosage/frequency/duration are free text for
    # the label; this is the number inventory moves by, so it has to be its own
    # column rather than something parsed back out of "twice daily for 5 days".
    quantity = Column(Integer, nullable=False, server_default="1", default=1)
    dosage = Column(String, default="")
    route = Column(String, default="")
    frequency = Column(String, default="")
    duration = Column(String, default="")
    instructions = Column(Text, default="")
    status = Column(String, default="pending")
    notes = Column(Text, default="")
    ordered_at = Column(String, nullable=False)


class InventoryMovement(Base):
    __tablename__ = "inventory_movements"

    id = Column(String, primary_key=True)
    hospital_id = Column(String, ForeignKey("hospitals.id", ondelete="CASCADE"), index=True, nullable=False)
    medicine_id = Column(String, index=True, nullable=False)
    movement_type = Column(String, nullable=False)
    quantity = Column(Integer, nullable=False)
    lot_number = Column(String, default="")
    expiry_date = Column(String, default="")
    reference_id = Column(String, default="")
    performed_by = Column(String, nullable=False)
    notes = Column(Text, default="")
    created_at = Column(String, nullable=False)


class Injectable(Base):
    """Catalogue of injectable products a hospital keeps in stock — vaccines,
    injectable antibiotics, analgesics. The injection-order counterpart of
    Medicine, kept separate because a shot is stocked, dosed and consumed
    differently (per-vial, cold chain, single administration) and its queue has
    two actors, not three: the doctor orders it and the nurse gives it."""

    __tablename__ = "injectables"

    id = Column(String, primary_key=True)
    hospital_id = Column(String, ForeignKey("hospitals.id", ondelete="CASCADE"), index=True, nullable=False)
    name = Column(String, nullable=False)
    category = Column(String, default="")   # vaccine | antibiotic | analgesic | ...
    form = Column(String, default="")       # vial | ampoule | prefilled syringe
    strength = Column(String, default="")   # "1 g", "40 mg/mL"
    # Default route for this product; an order may override it.
    route = Column(String, default="IM")    # IM | IV | SC | ID
    price = Column(Float, default=0)
    # Units (vials/ampoules) on hand — what an order consumes and what a
    # movement row moves by.
    stock = Column(Integer, default=0)
    reorder_level = Column(Integer, default=10)
    lot_number = Column(String, default="")
    expiry_date = Column(String, default="")  # ISO date
    location = Column(String, default="")     # fridge / shelf
    unit = Column(String, default="")         # "vial", "ampoule"


class InjectionOrder(Base):
    """A shot a doctor has ordered for a patient and a nurse has to give.

    Mirrors MedicationOrder without the pharmacist dispense step: stock is the
    nurse's to move, because administration *is* the point of consumption for a
    single-dose injectable. Status is ordered → administered → (or cancelled)."""

    __tablename__ = "injection_orders"

    id = Column(String, primary_key=True)
    hospital_id = Column(String, ForeignKey("hospitals.id", ondelete="CASCADE"), index=True, nullable=False)
    # Nullable: a shot may be ordered on a ward round with no appointment.
    appointment_id = Column(String, index=True, nullable=True)
    patient_id = Column(String, index=True, nullable=False)
    doctor_id = Column(String, nullable=False)  # the prescriber
    # The prescription this shot was ordered alongside, when it came from one.
    prescription_id = Column(String, index=True, nullable=True)
    # Catalogue link. Nullable: a doctor may name something not stocked, in
    # which case administration moves no stock.
    injectable_id = Column(String, nullable=True)
    injectable_name = Column(String, default="")
    dose = Column(String, default="")       # "1 g", "0.5 mL" — free text for the label
    route = Column(String, default="IM")
    # Vials/ampoules to consume at administration. Its own column rather than
    # something parsed out of the dose text, for the same reason MedicationOrder
    # keeps quantity separate.
    quantity = Column(Integer, nullable=False, server_default="1", default=1)
    scheduled_for = Column(String, default="")  # ISO date the shot is due, optional
    instructions = Column(Text, default="")
    status = Column(String, default="ordered")  # ordered | administered | cancelled
    # Filled by the nurse at administration.
    site = Column(String, default="")       # "Left deltoid", "IV line A"
    notes = Column(Text, default="")
    # Facts about what happened — written by the server on the status change,
    # never taken from the request body.
    administered_by = Column(String, nullable=True)  # user id of the nurse
    administered_at = Column(String, nullable=True)   # ISO datetime
    ordered_at = Column(String, nullable=False)


class InjectionStockMovement(Base):
    """Append-only ledger for injectable stock: restock, administer, adjust,
    expire. The injection counterpart of InventoryMovement."""

    __tablename__ = "injection_stock_movements"

    id = Column(String, primary_key=True)
    hospital_id = Column(String, ForeignKey("hospitals.id", ondelete="CASCADE"), index=True, nullable=False)
    injectable_id = Column(String, index=True, nullable=False)
    movement_type = Column(String, nullable=False)  # restock | administer | adjustment | expired
    quantity = Column(Integer, nullable=False)      # signed: +restock, -administer
    lot_number = Column(String, default="")
    expiry_date = Column(String, default="")
    reference_id = Column(String, default="")       # injection_order id for 'administer'
    performed_by = Column(String, nullable=False)
    notes = Column(Text, default="")
    created_at = Column(String, nullable=False)


class LabTest(Base):
    __tablename__ = "lab_tests"

    id = Column(String, primary_key=True)
    hospital_id = Column(String, ForeignKey("hospitals.id", ondelete="CASCADE"), index=True, nullable=False)
    name = Column(String, nullable=False)
    category = Column(String, default="")
    sample_type = Column(String, default="")
    price = Column(Float, default=0)
    turnaround_time = Column(String, default="")
    # Optional result template: [{"name","unit","referenceRange","low?","high?"}]
    parameters = Column(JSON, default=list)


# -----------------------------------------------------------------------------
# Lab orders + results.
# -----------------------------------------------------------------------------


class TestOrder(Base):
    __tablename__ = "test_orders"

    id = Column(String, primary_key=True)
    hospital_id = Column(String, ForeignKey("hospitals.id", ondelete="CASCADE"), index=True, nullable=False)
    patient_id = Column(String, index=True, nullable=False)
    doctor_id = Column(String, index=True, nullable=False)
    appointment_id = Column(String, nullable=True)
    # [{"testId","name","price"}]
    items = Column(JSON, default=list)
    # ordered | sample_collected | in_progress | completed | reviewed
    status = Column(String, default="ordered")
    priority = Column(String, default="routine")  # routine | urgent
    clinical_note = Column(Text, default="")
    ordered_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)


class TestResult(Base):
    __tablename__ = "test_results"

    id = Column(String, primary_key=True)
    hospital_id = Column(String, ForeignKey("hospitals.id", ondelete="CASCADE"), index=True, nullable=False)
    order_id = Column(String, index=True, nullable=False)
    test_id = Column(String, nullable=False)
    test_name = Column(String, default="")
    # [{"name","value","unit","referenceRange","flag"}]
    parameters = Column(JSON, default=list)
    remarks = Column(Text, default="")
    reported_by = Column(String, default="")
    reported_at = Column(String, nullable=False)


# -----------------------------------------------------------------------------
# Scheduling — doctor blocks (breaks / OT / unavailable).
# -----------------------------------------------------------------------------


class ScheduleBlock(Base):
    __tablename__ = "schedule_blocks"

    id = Column(String, primary_key=True)
    hospital_id = Column(String, ForeignKey("hospitals.id", ondelete="CASCADE"), index=True, nullable=False)
    doctor_id = Column(String, index=True, nullable=False)
    date = Column(String, nullable=False)
    start_time = Column(String, nullable=False)
    end_time = Column(String, nullable=False)
    type = Column(String, default="block")  # break | ot | block
    note = Column(Text, default="")
    created_at = Column(String, nullable=False)


# -----------------------------------------------------------------------------
# Telemedicine — video-consultation slots.
# -----------------------------------------------------------------------------


class VideoSlot(Base):
    __tablename__ = "video_slots"

    id = Column(String, primary_key=True)
    hospital_id = Column(String, ForeignKey("hospitals.id", ondelete="CASCADE"), index=True, nullable=False)
    doctor_id = Column(String, index=True, nullable=False)
    date = Column(String, nullable=False)
    time = Column(String, nullable=False)
    status = Column(String, default="open")  # open | booked
    appointment_id = Column(String, nullable=True)
    created_at = Column(String, nullable=False)


# -----------------------------------------------------------------------------
# Maternity signature tables — pregnancy records + antenatal (ANC) visits.
# Only used when the `anc` module is enabled for the hospital.
# -----------------------------------------------------------------------------


class PregnancyRecord(Base):
    __tablename__ = "pregnancy_records"

    id = Column(String, primary_key=True)
    hospital_id = Column(String, ForeignKey("hospitals.id", ondelete="CASCADE"), index=True, nullable=False)
    patient_id = Column(String, index=True, nullable=False)
    lmp = Column(String, nullable=False)  # last menstrual period
    edd = Column(String, nullable=False)  # estimated due date
    gravida = Column(Integer, default=0)
    para = Column(Integer, default=0)
    height = Column(Float, default=0)
    pre_pregnancy_weight = Column(Float, default=0)
    blood_group = Column(String, default="")
    risk_factors = Column(JSON, default=list)
    status = Column(String, default="active")  # active | delivered | closed
    notes = Column(Text, default="")
    created_at = Column(String, nullable=False)


class ANCVisit(Base):
    __tablename__ = "anc_visits"

    id = Column(String, primary_key=True)
    hospital_id = Column(String, ForeignKey("hospitals.id", ondelete="CASCADE"), index=True, nullable=False)
    pregnancy_id = Column(String, index=True, nullable=False)
    patient_id = Column(String, index=True, nullable=False)
    doctor_id = Column(String, nullable=False)
    date = Column(String, nullable=False)
    weeks = Column(Integer, default=0)
    weight = Column(Float, default=0)
    systolic = Column(Integer, default=0)
    diastolic = Column(Integer, default=0)
    fundal_height = Column(Float, default=0)
    hemoglobin = Column(Float, default=0)
    fetal_heart_rate = Column(Integer, default=0)
    notes = Column(Text, default="")
    created_at = Column(String, nullable=False)


# -----------------------------------------------------------------------------
# Newborn — baby records, growth measurements, immunizations.
# -----------------------------------------------------------------------------


class Baby(Base):
    __tablename__ = "babies"

    id = Column(String, primary_key=True)
    hospital_id = Column(String, ForeignKey("hospitals.id", ondelete="CASCADE"), index=True, nullable=False)
    mother_patient_id = Column(String, index=True, nullable=False)
    pregnancy_id = Column(String, nullable=True)
    name = Column(String, nullable=False)
    date_of_birth = Column(String, nullable=False)
    sex = Column(String, default="female")  # male | female
    birth_weight = Column(Float, default=0)
    birth_length = Column(Float, default=0)
    head_circumference = Column(Float, default=0)
    delivery_type = Column(String, default="normal")  # normal | c-section | assisted
    gestational_weeks = Column(Integer, default=0)
    created_at = Column(String, nullable=False)


class GrowthMeasurement(Base):
    __tablename__ = "growth_measurements"

    id = Column(String, primary_key=True)
    hospital_id = Column(String, ForeignKey("hospitals.id", ondelete="CASCADE"), index=True, nullable=False)
    baby_id = Column(String, index=True, nullable=False)
    date = Column(String, nullable=False)
    weight = Column(Float, default=0)
    height = Column(Float, default=0)
    head_circumference = Column(Float, default=0)
    created_at = Column(String, nullable=False)


class Immunization(Base):
    __tablename__ = "immunizations"

    id = Column(String, primary_key=True)
    hospital_id = Column(String, ForeignKey("hospitals.id", ondelete="CASCADE"), index=True, nullable=False)
    baby_id = Column(String, index=True, nullable=False)
    vaccine = Column(String, nullable=False)
    age_label = Column(String, default="")
    due_date = Column(String, nullable=False)
    status = Column(String, default="pending")  # pending | given
    given_date = Column(String, nullable=True)
    created_at = Column(String, nullable=False)


# -----------------------------------------------------------------------------
# Audit trail — see app/audit.py for why this exists and what fills it in.
# -----------------------------------------------------------------------------


class AuditLog(Base):
    """One row per request that touched tenant data.

    Deliberately *not* a child of any clinical table: the trail has to outlive
    the record it describes, or deleting a patient would erase the evidence of
    who read them. That is also why there is no ForeignKey on patient_id or
    actor_user_id — those are identifiers, not relationships, and a cascade here
    would be a compliance bug.

    Nothing in the app updates or deletes these rows. Enforcing that in the
    database (an append-only trigger, or a role without UPDATE/DELETE) is the
    next step for a deployment that needs the trail to be tamper-evident.
    """

    __tablename__ = "audit_logs"

    id = Column(String, primary_key=True)
    # Correlates the trail row with an X-Request-Id the client was handed.
    request_id = Column(String, index=True, nullable=False)
    # NULL for platform-level actions and for failed logins, where no tenant was
    # ever resolved. Not an FK for the same reason as above.
    hospital_id = Column(String, index=True, nullable=True)
    # NULL when the request never authenticated (a rejected token, a bad login).
    actor_user_id = Column(String, index=True, nullable=True)
    actor_role = Column(String, default="")
    actor_ip = Column(String, default="")
    user_agent = Column(String, default="")
    method = Column(String, nullable=False)
    # The matched route template, not the concrete URL — group-by-able.
    path = Column(String, nullable=False)
    # The capability the caller acted under, and at what breadth. Together these
    # answer "by what authority?", which is the question a 403 review asks.
    permission = Column(String, default="")
    scope = Column(String, nullable=True)
    subject_type = Column(String, default="")
    subject_id = Column(String, default="")
    # The person the accessed data is about — the column an inspector filters on
    # to answer "who has opened this patient's chart?".
    patient_id = Column(String, index=True, nullable=True)
    # read | create | update | delete | login | login_failed | other
    action = Column(String, nullable=False)
    status_code = Column(Integer, nullable=False)
    # success | denied | failed | error
    outcome = Column(String, nullable=False)
    detail = Column(String, default="")
    duration_ms = Column(Integer, default=0)
    created_at = Column(String, index=True, nullable=False)

    __table_args__ = (
        # The two questions the table is actually queried with: "what happened
        # at this hospital lately" and "who touched this patient".
        Index("ix_audit_tenant_time", "hospital_id", "created_at"),
        Index("ix_audit_patient_time", "patient_id", "created_at"),
        Index("ix_audit_actor_time", "actor_user_id", "created_at"),
    )


# -----------------------------------------------------------------------------
# Consent — see app/consent.py for the obligations these two tables answer.
# -----------------------------------------------------------------------------


class ConsentPurpose(Base):
    """One thing the hospital may do with a person's data, stated in advance.

    Code-owned and versioned, exactly like Permission: a purpose exists because
    a feature processes data for it, so it arrives by migration rather than
    being typed in by a hospital. That is what makes the notice auditable — the
    text a patient agreed to is a row this repository can show you, not free
    text someone edited afterwards.

    Itemised on purpose. DPDP requires consent to be specific and unconditional,
    so "treatment" and "marketing" have to be separately refusable; bundling
    them into one tickbox is the failure mode this table exists to prevent.
    """

    __tablename__ = "consent_purposes"

    # e.g. "treatment", "communications.marketing"
    code = Column(String, primary_key=True)
    label = Column(String, nullable=False)
    # The notice itself — what the person is being told, in plain words.
    notice = Column(Text, nullable=False)
    # Bumped whenever `notice` changes materially. Copied onto every Consent, so
    # a record always says which text was agreed to rather than pointing at
    # whatever the current wording happens to be.
    version = Column(Integer, nullable=False, default=1)
    # True when the service genuinely cannot be delivered without it (you cannot
    # be treated without the hospital processing your health data). Everything
    # else must be refusable without losing care — that is what "unconditional"
    # means, and why this flag is not just a UI hint.
    required = Column(Boolean, nullable=False, default=False)
    # Feature this purpose belongs to, mirroring Permission.module: a hospital
    # without telemedicine should not be asking for a telemedicine consent.
    module = Column(String, nullable=True)
    # "per_person" — asked once at registration and stands until withdrawn.
    # "per_event" — asked each time (a teleconsultation, under the Telemedicine
    # Practice Guidelines 2020, is consented per consultation).
    cadence = Column(String, nullable=False, default="per_person")
    sort_order = Column(Integer, nullable=False, default=0)


class Consent(Base):
    """A person's answer to one purpose, at one point in time.

    Append-mostly: withdrawal writes `withdrawn_at` on the row rather than
    deleting it, because "they consented and later withdrew" and "they never
    consented" are different facts and only one of them is a defence.

    Not FK-linked to Patient for the same reason AuditLog is not: the proof that
    consent was obtained has to outlive the record it authorised.
    """

    __tablename__ = "consents"

    id = Column(String, primary_key=True)
    hospital_id = Column(String, ForeignKey("hospitals.id", ondelete="CASCADE"), index=True, nullable=False)
    # The person the data is about. user_id rather than patient_id because staff
    # have data-protection rights too, and their consent has nowhere else to go.
    subject_user_id = Column(String, index=True, nullable=False)
    purpose_code = Column(
        String, ForeignKey("consent_purposes.code"), index=True, nullable=False
    )
    # The notice version actually shown. See ConsentPurpose.version.
    version = Column(Integer, nullable=False, default=1)
    # "explicit" — a clear affirmative action by the subject.
    # "implied_patient_initiated" — the Telemedicine Practice Guidelines treat a
    #   consultation the patient started as consented; the row records that this
    #   is *why*, so nobody later mistakes it for a ticked box.
    method = Column(String, nullable=False, default="explicit")
    # Who operated the form. Differs from subject_user_id when a receptionist
    # records consent at the desk, which is the case an auditor asks about.
    recorded_by_user_id = Column(String, nullable=True)
    # DPDP requires verifiable consent from a parent or lawful guardian for a
    # data principal under 18. Populated whenever the subject was a minor on the
    # day it was given — see consent.py, which refuses to record without it.
    guardian_user_id = Column(String, nullable=True)
    # The guardian usually has no account of their own — a parent consenting for
    # a newborn is not a user of this system — so naming them has to work
    # without one. Either field identifies them; both may be set when the parent
    # is themselves a patient here.
    guardian_name = Column(String, default="")
    guardian_relationship = Column(String, default="")
    # Ties a per_event consent to the thing it authorised (a teleconsultation).
    appointment_id = Column(String, index=True, nullable=True)
    # Evidence of the act, same fields the audit trail keeps.
    ip = Column(String, default="")
    user_agent = Column(String, default="")
    granted_at = Column(String, nullable=False)
    # Set when withdrawn. Withdrawal must be as easy as granting was, so this is
    # written by the subject's own request — no staff approval step.
    withdrawn_at = Column(String, nullable=True)

    __table_args__ = (
        # "What does this person currently allow?" — the query every guard runs.
        Index("ix_consents_subject_purpose", "subject_user_id", "purpose_code"),
    )


# -----------------------------------------------------------------------------
# Sessions — see app/sessions.py. What makes a sign-in revocable.
# -----------------------------------------------------------------------------


class Session(Base):
    """One sign-in, and the server's ability to end it.

    A JWT is a bearer credential nobody can take back: once signed, it is valid
    until it expires, whatever happens to the person holding it. That is fine
    for a session measured in minutes and unacceptable for one measured in days
    over health records — a dismissed employee's token would keep working.

    So the access token stays short and carries `sid` pointing here, and this
    row is checked on every request. Ending a session is a write to this table,
    which takes effect on the very next call rather than whenever the token
    happens to lapse.
    """

    __tablename__ = "sessions"

    # Also the `sid` claim in every access token issued from this session.
    id = Column(String, primary_key=True)
    # All the rotations descended from one sign-in. Refresh tokens rotate on
    # every use, so a stolen one is only useful until the real client next
    # refreshes — at which point the theft becomes *visible*, and revoking the
    # family is how the whole line is cut rather than just the copy presented.
    family_id = Column(String, index=True, nullable=False)
    user_id = Column(String, index=True, nullable=False)
    # NULL for a platform superadmin, who belongs to no hospital.
    hospital_id = Column(String, index=True, nullable=True)
    # SHA-256 of the refresh token. Hashed for the same reason a password is:
    # a database leak must not hand over live sessions. Plain SHA-256 rather
    # than bcrypt because the input is 384 bits of CSPRNG output, so there is no
    # low-entropy guess to slow down — only a constant-time compare to get right.
    refresh_token_hash = Column(String, unique=True, index=True, nullable=False)
    issued_at = Column(String, nullable=False)
    # When the refresh token dies. The access token carries its own, much
    # shorter, expiry inside the JWT.
    expires_at = Column(String, nullable=False)
    # Set the moment this token is exchanged. A second presentation after this
    # is set is replay, not a race, and revokes the family.
    rotated_at = Column(String, nullable=True)
    revoked_at = Column(String, nullable=True)
    # logout | logout_all | password_change | role_change | user_deleted |
    # hospital_suspended | refresh_reuse | superseded
    revoked_reason = Column(String, default="")
    last_used_at = Column(String, nullable=True)
    ip = Column(String, default="")
    user_agent = Column(String, default="")

    __table_args__ = (
        # "Is this session still good?" runs on every authenticated request, and
        # "cut every session this person has" runs on dismissal.
        Index("ix_sessions_user_live", "user_id", "revoked_at"),
    )
