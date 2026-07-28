from sqlalchemy import Column, Float, ForeignKey, Index, Integer, JSON, String, Text

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


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True)
    # NULL only for a platform superadmin; every tenant user has a hospital_id.
    hospital_id = Column(String, ForeignKey("hospitals.id"), index=True, nullable=True)
    email = Column(String, index=True, nullable=False)
    password = Column(String, nullable=False)  # bcrypt hash
    name = Column(String, nullable=False)
    phone = Column(String, default="")
    # superadmin | admin | doctor | nurse | lab | patient
    role = Column(String, nullable=False)
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
