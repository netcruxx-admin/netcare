from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

Role = Literal["superadmin", "admin", "doctor", "nurse", "lab", "patient"]
# Roles a self-service /auth/register call may create (superadmin/admin are
# provisioned, not self-registered).
RegisterRole = Literal["patient", "doctor", "nurse", "lab"]
AppointmentStatus = Literal["scheduled", "completed", "cancelled"]
AppointmentMode = Literal["in-person", "video"]
PaymentStatus = Literal["pending", "completed", "failed"]
HospitalCategory = Literal["maternity", "multi-specialty", "dental", "eye", "diagnostic"]
HospitalStatus = Literal["active", "suspended"]


class CamelModel(BaseModel):
    """Base model: snake_case in Python, camelCase over the wire (matches the TS interfaces)."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
    )


# ---------- Hospital (tenant) ----------
class HospitalOut(CamelModel):
    id: str
    name: str
    subdomain: str
    category: HospitalCategory
    tagline: str = ""
    currency: str = "INR"
    modules: dict = {}
    theme: dict = {}
    status: HospitalStatus = "active"
    created_at: str


class HospitalCreate(CamelModel):
    """Onboard a new tenant. Modules/theme/departments are seeded from the
    chosen category template unless overridden."""

    name: str
    subdomain: str
    category: HospitalCategory
    # Optional first admin for the hospital; defaults are derived if omitted.
    admin_email: Optional[str] = None
    admin_password: Optional[str] = None
    admin_name: Optional[str] = None


class HospitalUpdate(CamelModel):
    name: Optional[str] = None
    tagline: Optional[str] = None
    currency: Optional[str] = None
    modules: Optional[dict] = None
    theme: Optional[dict] = None
    category: Optional[HospitalCategory] = None
    status: Optional[HospitalStatus] = None


# ---------- Auth ----------
class RegisterRequest(CamelModel):
    email: str
    password: str
    name: str
    role: RegisterRole
    phone: str = ""


class LoginRequest(CamelModel):
    email: str
    password: str


class UserOut(CamelModel):
    id: str
    hospital_id: Optional[str] = None
    email: str
    name: str
    phone: str = ""
    role: Role
    created_at: str


# ---------- Patient ----------
class PatientOut(CamelModel):
    id: str
    hospital_id: Optional[str] = None
    user_id: str
    phone: str = ""
    date_of_birth: str = ""
    gender: str = ""
    blood_group: str = ""
    allergies: str = ""
    chronic_diseases: str = ""
    emergency_contact: str = ""
    emergency_phone: str = ""
    medical_history: str = ""
    insurance_provider: str = ""
    insurance_number: str = ""
    documents: List[str] = []


class PatientUpdate(CamelModel):
    date_of_birth: Optional[str] = None
    gender: Optional[str] = None
    blood_group: Optional[str] = None
    allergies: Optional[str] = None
    chronic_diseases: Optional[str] = None
    emergency_contact: Optional[str] = None
    emergency_phone: Optional[str] = None
    medical_history: Optional[str] = None
    insurance_provider: Optional[str] = None
    insurance_number: Optional[str] = None
    documents: Optional[List[str]] = None


# ---------- Doctor ----------
class TimeSlot(CamelModel):
    date: str
    start_time: str
    end_time: str
    available: bool = True


class DoctorOut(CamelModel):
    id: str
    hospital_id: Optional[str] = None
    user_id: str
    qualification: str = ""
    specialization: str = ""
    experience_years: int = 0
    consultation_fee: float = 0
    available_slots: List[TimeSlot] = []
    license_number: str = ""
    medical_council: str = ""
    registration_year: str = ""
    verification_status: str = "verified"


# ---------- Department ----------
class DepartmentOut(CamelModel):
    id: str
    hospital_id: Optional[str] = None
    name: str
    description: str = ""


class DepartmentCreate(CamelModel):
    name: str
    description: str = ""


class DepartmentUpdate(CamelModel):
    name: Optional[str] = None
    description: Optional[str] = None


# ---------- Appointment ----------
class AppointmentCreate(CamelModel):
    patient_id: str
    doctor_id: str
    department_id: str
    date: str
    time: str
    reason: str = ""
    notes: str = ""
    status: AppointmentStatus = "scheduled"
    mode: AppointmentMode = "in-person"
    follow_up_of: Optional[str] = None


class AppointmentUpdate(CamelModel):
    date: Optional[str] = None
    time: Optional[str] = None
    status: Optional[AppointmentStatus] = None
    mode: Optional[AppointmentMode] = None
    reason: Optional[str] = None
    notes: Optional[str] = None


class AppointmentOut(CamelModel):
    id: str
    hospital_id: Optional[str] = None
    patient_id: str
    doctor_id: str
    department_id: str
    date: str
    time: str
    status: AppointmentStatus
    mode: AppointmentMode = "in-person"
    reason: str = ""
    notes: str = ""
    follow_up_of: Optional[str] = None
    created_at: str


# ---------- Medical Record ----------
class MedicalRecordCreate(CamelModel):
    patient_id: str
    appointment_id: str
    doctor_id: str
    diagnosis: str = ""
    prescription: str = ""
    lab_reports: List[str] = []


class MedicalRecordOut(CamelModel):
    id: str
    patient_id: str
    appointment_id: str
    doctor_id: str
    diagnosis: str = ""
    prescription: str = ""
    lab_reports: List[str] = []
    created_at: str


# ---------- Payment ----------
class PaymentCreate(CamelModel):
    appointment_id: str
    patient_id: str
    amount: float
    payment_method: str = ""
    status: PaymentStatus = "pending"


class PaymentOut(CamelModel):
    id: str
    appointment_id: str
    patient_id: str
    amount: float
    status: PaymentStatus
    payment_method: str = ""
    created_at: str


# ---------- Prescription ----------
class PrescriptionCreate(CamelModel):
    appointment_id: str
    patient_id: str
    doctor_id: str
    medicine_name: str = ""
    dosage: str = ""
    frequency: str = ""
    duration: str = ""
    instructions: str = ""


class PrescriptionOut(CamelModel):
    id: str
    appointment_id: str
    patient_id: str
    doctor_id: str
    medicine_name: str = ""
    dosage: str = ""
    frequency: str = ""
    duration: str = ""
    instructions: str = ""
    created_at: str


# ---------- Vitals ----------
class VitalsCreate(CamelModel):
    appointment_id: str
    patient_id: str
    doctor_id: str
    temperature: float = 0
    blood_pressure: str = ""
    heart_rate: int = 0
    respiratory_rate: int = 0
    weight: float = 0
    height: float = 0
    notes: str = ""


class VitalsOut(CamelModel):
    id: str
    appointment_id: str
    patient_id: str
    doctor_id: str
    temperature: float = 0
    blood_pressure: str = ""
    heart_rate: int = 0
    respiratory_rate: int = 0
    weight: float = 0
    height: float = 0
    notes: str = ""
    created_at: str


# ---------- Auth response (mirrors authOperations.AuthSession) ----------
class AuthResponse(CamelModel):
    user: UserOut
    patient: Optional[PatientOut] = None
    token: str
    is_authenticated: bool = True
