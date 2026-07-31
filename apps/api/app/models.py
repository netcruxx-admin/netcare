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
    """A tenant. Server-side source of truth for everything the frontend used to
    hardcode in lib/hospitalConfig.ts (name, branding, currency, enabled
    modules) plus the category that drives its template."""

    __tablename__ = "hospitals"

    id = Column(String, primary_key=True)  # e.g. "hosp-1"
    name = Column(String, nullable=False)
    subdomain = Column(String, unique=True, index=True, nullable=False)
    # maternity | multi-specialty | dental | eye | diagnostic
    category = Column(String, nullable=False, default="maternity")
    tagline = Column(String, default="")
    currency = Column(String, default="INR")
    # Which optional feature-modules are switched on (superadmin-controlled).
    modules = Column(JSON, default=dict)
    # Branding colors {"primary": "#...", "primaryDark": "#..."}.
    theme = Column(JSON, default=dict)
    status = Column(String, default="active")  # active | suspended
    created_at = Column(String, nullable=False)


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


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True)
    # NULL only for a platform superadmin; every tenant user has a hospital_id.
    hospital_id = Column(String, ForeignKey("hospitals.id"), index=True, nullable=True)
    email = Column(String, index=True, nullable=False)
    password = Column(String, nullable=False)  # bcrypt hash
    name = Column(String, nullable=False)
    phone = Column(String, default="")
    # superadmin | admin | doctor | nurse | lab | patient (see Role above)
    role = Column(String, ForeignKey("roles.code"), index=True, nullable=False)
    created_at = Column(String, nullable=False)

    __table_args__ = (
        # Email is unique per tenant (the same person can exist at two
        # hospitals), and globally unique among platform users (NULL tenant).
        # Two partial unique indexes because Postgres treats NULLs as distinct.
        Index(
            "uq_users_tenant_email",
            "hospital_id",
            "email",
            unique=True,
            postgresql_where=Column("hospital_id").isnot(None),
        ),
        Index(
            "uq_users_platform_email",
            "email",
            unique=True,
            postgresql_where=Column("hospital_id").is_(None),
        ),
    )


class Patient(Base):
    __tablename__ = "patients"

    id = Column(String, primary_key=True)
    hospital_id = Column(String, ForeignKey("hospitals.id"), index=True, nullable=False)
    user_id = Column(String, index=True, nullable=False)
    phone = Column(String, default="")
    date_of_birth = Column(String, default="")
    gender = Column(String, default="")
    blood_group = Column(String, default="")
    allergies = Column(Text, default="")
    chronic_diseases = Column(Text, default="")
    emergency_contact = Column(String, default="")
    emergency_phone = Column(String, default="")
    medical_history = Column(Text, default="")
    insurance_provider = Column(String, default="")
    insurance_number = Column(String, default="")
    documents = Column(JSON, default=list)


class Doctor(Base):
    __tablename__ = "doctors"

    id = Column(String, primary_key=True)
    hospital_id = Column(String, ForeignKey("hospitals.id"), index=True, nullable=False)
    user_id = Column(String, index=True, nullable=False)
    qualification = Column(Text, default="")
    specialization = Column(String, default="")
    experience_years = Column(Integer, default=0)
    consultation_fee = Column(Float, default=0)
    available_slots = Column(JSON, default=list)
    # Medical-council credentials (collected at self-registration).
    license_number = Column(String, default="")
    medical_council = Column(String, default="")
    registration_year = Column(String, default="")
    # 'verified' for seeded doctors; self-registered start 'pending'.
    verification_status = Column(String, default="verified")


class Department(Base):
    __tablename__ = "departments"

    id = Column(String, primary_key=True)
    hospital_id = Column(String, ForeignKey("hospitals.id"), index=True, nullable=False)
    name = Column(String, nullable=False)
    description = Column(Text, default="")


class Appointment(Base):
    __tablename__ = "appointments"

    id = Column(String, primary_key=True)
    hospital_id = Column(String, ForeignKey("hospitals.id"), index=True, nullable=False)
    patient_id = Column(String, index=True, nullable=False)
    doctor_id = Column(String, index=True, nullable=False)
    department_id = Column(String, nullable=False)
    date = Column(String, nullable=False)
    time = Column(String, nullable=False)
    status = Column(String, default="scheduled")  # scheduled | completed | cancelled
    mode = Column(String, default="in-person")  # in-person | video
    reason = Column(Text, default="")
    notes = Column(Text, default="")
    # Set when booked as a follow-up to an earlier appointment.
    follow_up_of = Column(String, nullable=True)
    created_at = Column(String, nullable=False)


class MedicalRecord(Base):
    __tablename__ = "medical_records"

    id = Column(String, primary_key=True)
    hospital_id = Column(String, ForeignKey("hospitals.id"), index=True, nullable=False)
    patient_id = Column(String, index=True, nullable=False)
    appointment_id = Column(String, index=True, nullable=False)
    doctor_id = Column(String, nullable=False)
    diagnosis = Column(Text, default="")
    prescription = Column(Text, default="")
    lab_reports = Column(JSON, default=list)
    created_at = Column(String, nullable=False)


class Payment(Base):
    __tablename__ = "payments"

    id = Column(String, primary_key=True)
    hospital_id = Column(String, ForeignKey("hospitals.id"), index=True, nullable=False)
    appointment_id = Column(String, index=True, nullable=False)
    patient_id = Column(String, index=True, nullable=False)
    amount = Column(Float, nullable=False)
    status = Column(String, default="pending")  # pending | completed | failed
    payment_method = Column(String, default="")
    created_at = Column(String, nullable=False)


class Prescription(Base):
    __tablename__ = "prescriptions"

    id = Column(String, primary_key=True)
    hospital_id = Column(String, ForeignKey("hospitals.id"), index=True, nullable=False)
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
    hospital_id = Column(String, ForeignKey("hospitals.id"), index=True, nullable=False)
    appointment_id = Column(String, index=True, nullable=False)
    patient_id = Column(String, index=True, nullable=False)
    doctor_id = Column(String, nullable=False)
    temperature = Column(Float, default=0)
    blood_pressure = Column(String, default="")
    heart_rate = Column(Integer, default=0)
    respiratory_rate = Column(Integer, default=0)
    weight = Column(Float, default=0)
    height = Column(Float, default=0)
    notes = Column(Text, default="")
    created_at = Column(String, nullable=False)


# -----------------------------------------------------------------------------
# Catalog — pharmacy + diagnostics offerings, seeded per hospital.
# -----------------------------------------------------------------------------


class Medicine(Base):
    __tablename__ = "medicines"

    id = Column(String, primary_key=True)
    hospital_id = Column(String, ForeignKey("hospitals.id"), index=True, nullable=False)
    name = Column(String, nullable=False)
    category = Column(String, default="")
    form = Column(String, default="")
    strength = Column(String, default="")
    price = Column(Float, default=0)
    stock = Column(Integer, default=0)


class LabTest(Base):
    __tablename__ = "lab_tests"

    id = Column(String, primary_key=True)
    hospital_id = Column(String, ForeignKey("hospitals.id"), index=True, nullable=False)
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
    hospital_id = Column(String, ForeignKey("hospitals.id"), index=True, nullable=False)
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
    hospital_id = Column(String, ForeignKey("hospitals.id"), index=True, nullable=False)
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
    hospital_id = Column(String, ForeignKey("hospitals.id"), index=True, nullable=False)
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
    hospital_id = Column(String, ForeignKey("hospitals.id"), index=True, nullable=False)
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
    hospital_id = Column(String, ForeignKey("hospitals.id"), index=True, nullable=False)
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
    hospital_id = Column(String, ForeignKey("hospitals.id"), index=True, nullable=False)
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
    hospital_id = Column(String, ForeignKey("hospitals.id"), index=True, nullable=False)
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
    hospital_id = Column(String, ForeignKey("hospitals.id"), index=True, nullable=False)
    baby_id = Column(String, index=True, nullable=False)
    date = Column(String, nullable=False)
    weight = Column(Float, default=0)
    height = Column(Float, default=0)
    head_circumference = Column(Float, default=0)
    created_at = Column(String, nullable=False)


class Immunization(Base):
    __tablename__ = "immunizations"

    id = Column(String, primary_key=True)
    hospital_id = Column(String, ForeignKey("hospitals.id"), index=True, nullable=False)
    baby_id = Column(String, index=True, nullable=False)
    vaccine = Column(String, nullable=False)
    age_label = Column(String, default="")
    due_date = Column(String, nullable=False)
    status = Column(String, default="pending")  # pending | given
    given_date = Column(String, nullable=True)
    created_at = Column(String, nullable=False)
