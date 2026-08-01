from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

# Any code present in the `roles` table. Not a Literal: the catalog is
# superadmin-managed at runtime (routers/roles.py), so a closed union here would
# make every user holding a custom role fail response validation. Referential
# integrity is enforced by the users.role -> roles.code FK instead.
Role = str
# The only role a public, unauthenticated /auth/register call may create.
# Staff accounts carry access to other people's records, so they are provisioned
# through POST /users by someone holding `users.manage` — never self-served.
RegisterRole = Literal["patient"]
AppointmentStatus = Literal["scheduled", "completed", "cancelled"]
AppointmentMode = Literal["in-person", "video"]
PaymentStatus = Literal["pending", "completed", "failed"]
HospitalCategory = Literal["maternity", "multi-specialty", "dental", "eye", "diagnostic"]
HospitalStatus = Literal["active", "suspended"]
TestOrderStatus = Literal[
    "ordered", "sample_collected", "in_progress", "completed", "reviewed"
]
TestPriority = Literal["routine", "urgent"]
ResultFlag = Literal["normal", "low", "high", "critical"]
BlockType = Literal["break", "ot", "block"]
VideoSlotStatus = Literal["open", "booked"]
PregnancyStatus = Literal["active", "delivered", "closed"]
BabySex = Literal["male", "female"]
DeliveryType = Literal["normal", "c-section", "assisted"]
ImmunizationStatus = Literal["pending", "given"]


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
    # Optional theme override (primary/primaryDark colours from the UI picker).
    theme: Optional[dict] = None
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


# ---------- Permissions ----------
class PermissionOut(CamelModel):
    """One entry of the grantable catalog, for the superadmin's permission matrix."""

    code: str
    label: str
    description: str = ""
    resource: str
    action: str
    # Hospital module this depends on; blank when always available.
    module: Optional[str] = None
    supports_scope: bool = False
    sort_order: int = 0


class PermissionGrant(CamelModel):
    """A permission handed to a role, at a breadth. `scope` is "own" or "all"
    where the permission supports it, otherwise null."""

    code: str
    scope: Optional[str] = None


# ---------- Role (platform-wide catalog, superadmin-managed) ----------
class RoleOut(CamelModel):
    code: str
    label: str
    description: str = ""
    is_platform: bool = False
    sort_order: int = 0
    # Dashboard this role lands on after login ("" = no dedicated dashboard).
    home_path: str = ""
    # Everything this role may do. Set when the role is created and editable
    # afterwards — the superadmin's decision, never inferred from the code.
    permissions: List[PermissionGrant] = []
    # How many users currently hold this role (superadmin needs it to know
    # whether a role is safe to delete).
    user_count: int = 0


class RoleOptionOut(CamelModel):
    """Slim projection for role pickers. Readable by any signed-in user, unlike
    the full catalog — it carries no user counts or platform-internal detail."""

    code: str
    label: str
    home_path: str = ""
    # Whether /auth/register accepts this role. Derived from RegisterRole, not
    # stored, so the UI never has to duplicate that security boundary.
    self_registerable: bool = False


class RoleCreate(CamelModel):
    # Lowercase slug; becomes users.role for anyone assigned this role.
    code: str
    label: str
    description: str = ""
    is_platform: bool = False
    sort_order: int = 0
    home_path: str = ""
    # Granted with the role in one call: creating a role and deciding what it can
    # do is a single decision, so it is a single request.
    permissions: List[PermissionGrant] = []


class RoleUpdate(CamelModel):
    """`code` is the primary key users.role points at, so it is not editable."""

    label: Optional[str] = None
    description: Optional[str] = None
    is_platform: Optional[bool] = None
    sort_order: Optional[int] = None
    home_path: Optional[str] = None
    # When present, replaces the role's grants wholesale (omit to leave alone).
    permissions: Optional[List[PermissionGrant]] = None


# ---------- Auth ----------
class RegisterRequest(CamelModel):
    email: str
    password: str
    name: str
    role: RegisterRole
    phone: str = ""
    # Doctor-specific (ignored for other roles)
    specialization: Optional[str] = None
    qualification: Optional[str] = None
    experience_years: Optional[int] = None
    # Patient-specific (ignored for other roles)
    gender: Optional[str] = None
    blood_group: Optional[str] = None
    date_of_birth: Optional[str] = None


class UserCreate(CamelModel):
    """Staff (or patient) account created by someone with `users.manage`.
    Unlike RegisterRequest, any non-platform role in the catalog is allowed —
    including roles a superadmin added at runtime."""

    email: str
    password: str
    name: str
    role: str
    phone: str = ""
    # Doctor-specific (ignored for other roles)
    specialization: Optional[str] = None
    qualification: Optional[str] = None
    experience_years: Optional[int] = None
    # Patient-specific (ignored for other roles)
    gender: Optional[str] = None
    blood_group: Optional[str] = None
    date_of_birth: Optional[str] = None


class UserUpdate(CamelModel):
    """Edit an existing account. Password is re-hashed when supplied; role is
    validated against the catalog and may never be a platform role."""

    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    role: Optional[str] = None
    password: Optional[str] = None


class OwnAccountUpdate(CamelModel):
    """What a user may change about themselves. Deliberately excludes role and
    password — self-service must not be a path to changing your own access."""

    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None


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
    user: Optional["UserOut"] = None


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
    user: Optional["UserOut"] = None


class DoctorUpdate(CamelModel):
    """Professional details, plus the account fields that live on the user row
    (name/email/phone) so a doctor can maintain one profile form."""

    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    qualification: Optional[str] = None
    specialization: Optional[str] = None
    experience_years: Optional[int] = None
    consultation_fee: Optional[float] = None
    available_slots: Optional[List[TimeSlot]] = None
    license_number: Optional[str] = None
    medical_council: Optional[str] = None
    registration_year: Optional[str] = None
    verification_status: Optional[str] = None


class DoctorAvailabilityOut(CamelModel):
    """What a booker needs to pick a slot, and nothing more: the times already
    taken and the doctor's blocks. Deliberately carries no appointment detail,
    so it is safe for a patient who cannot read other people's bookings."""

    doctor_id: str
    date: str
    taken: List[str] = []
    blocks: List["ScheduleBlockOut"] = []


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
    # Reassignment. Accepted only from a caller who manages every appointment —
    # see update_appointment. `rescheduled` is deliberately absent: the server
    # decides that from whether the date or time actually moved.
    doctor_id: Optional[str] = None
    department_id: Optional[str] = None


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
    rescheduled: bool = False
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


# ---------- Payment update ----------
class PaymentUpdate(CamelModel):
    status: Optional[PaymentStatus] = None
    payment_method: Optional[str] = None


# ---------- Medicine (pharmacy catalog) ----------
class MedicineCreate(CamelModel):
    name: str
    category: str = ""
    form: str = ""
    strength: str = ""
    price: float = 0
    stock: int = 0


class MedicineUpdate(CamelModel):
    name: Optional[str] = None
    category: Optional[str] = None
    form: Optional[str] = None
    strength: Optional[str] = None
    price: Optional[float] = None
    stock: Optional[int] = None


class MedicineOut(CamelModel):
    id: str
    hospital_id: Optional[str] = None
    name: str
    category: str = ""
    form: str = ""
    strength: str = ""
    price: float = 0
    stock: int = 0


# ---------- Lab test (diagnostics catalog) ----------
class TestParameterTemplate(CamelModel):
    name: str
    unit: str = ""
    reference_range: str = ""
    low: Optional[float] = None
    high: Optional[float] = None


class LabTestCreate(CamelModel):
    name: str
    category: str = ""
    sample_type: str = ""
    price: float = 0
    turnaround_time: str = ""
    parameters: List[TestParameterTemplate] = []


class LabTestUpdate(CamelModel):
    name: Optional[str] = None
    category: Optional[str] = None
    sample_type: Optional[str] = None
    price: Optional[float] = None
    turnaround_time: Optional[str] = None
    parameters: Optional[List[TestParameterTemplate]] = None


class LabTestOut(CamelModel):
    id: str
    hospital_id: Optional[str] = None
    name: str
    category: str = ""
    sample_type: str = ""
    price: float = 0
    turnaround_time: str = ""
    parameters: List[TestParameterTemplate] = []


# ---------- Test order + result ----------
class TestOrderItem(CamelModel):
    test_id: str
    name: str
    price: float = 0


class TestOrderCreate(CamelModel):
    patient_id: str
    doctor_id: str
    appointment_id: Optional[str] = None
    items: List[TestOrderItem] = []
    priority: TestPriority = "routine"
    clinical_note: str = ""


class TestOrderUpdate(CamelModel):
    status: Optional[TestOrderStatus] = None
    priority: Optional[TestPriority] = None
    clinical_note: Optional[str] = None


class TestOrderOut(CamelModel):
    id: str
    hospital_id: Optional[str] = None
    patient_id: str
    doctor_id: str
    appointment_id: Optional[str] = None
    items: List[TestOrderItem] = []
    status: TestOrderStatus = "ordered"
    priority: TestPriority = "routine"
    clinical_note: str = ""
    ordered_at: str
    updated_at: str


class TestResultParameter(CamelModel):
    name: str
    value: str = ""
    unit: str = ""
    reference_range: str = ""
    flag: ResultFlag = "normal"


class TestResultUpsert(CamelModel):
    order_id: str
    test_id: str
    test_name: str = ""
    parameters: List[TestResultParameter] = []
    remarks: str = ""
    reported_by: str = ""


class TestResultOut(CamelModel):
    id: str
    hospital_id: Optional[str] = None
    order_id: str
    test_id: str
    test_name: str = ""
    parameters: List[TestResultParameter] = []
    remarks: str = ""
    reported_by: str = ""
    reported_at: str


# ---------- Schedule block ----------
class ScheduleBlockCreate(CamelModel):
    doctor_id: str
    date: str
    start_time: str
    end_time: str
    type: BlockType = "block"
    note: str = ""


class ScheduleBlockOut(CamelModel):
    id: str
    hospital_id: Optional[str] = None
    doctor_id: str
    date: str
    start_time: str
    end_time: str
    type: BlockType = "block"
    note: str = ""
    created_at: str


# ---------- Video slot ----------
class VideoSlotCreate(CamelModel):
    doctor_id: str
    date: str
    time: str


class VideoSlotBook(CamelModel):
    appointment_id: str


class VideoSlotOut(CamelModel):
    id: str
    hospital_id: Optional[str] = None
    doctor_id: str
    date: str
    time: str
    status: VideoSlotStatus = "open"
    appointment_id: Optional[str] = None
    created_at: str


# ---------- Pregnancy record ----------
class PregnancyCreate(CamelModel):
    patient_id: str
    lmp: str
    edd: str
    gravida: int = 0
    para: int = 0
    height: float = 0
    pre_pregnancy_weight: float = 0
    blood_group: str = ""
    risk_factors: List[str] = []
    status: PregnancyStatus = "active"
    notes: str = ""


class PregnancyUpdate(CamelModel):
    edd: Optional[str] = None
    gravida: Optional[int] = None
    para: Optional[int] = None
    height: Optional[float] = None
    pre_pregnancy_weight: Optional[float] = None
    blood_group: Optional[str] = None
    risk_factors: Optional[List[str]] = None
    status: Optional[PregnancyStatus] = None
    notes: Optional[str] = None


class PregnancyOut(CamelModel):
    id: str
    hospital_id: Optional[str] = None
    patient_id: str
    lmp: str
    edd: str
    gravida: int = 0
    para: int = 0
    height: float = 0
    pre_pregnancy_weight: float = 0
    blood_group: str = ""
    risk_factors: List[str] = []
    status: PregnancyStatus = "active"
    notes: str = ""
    created_at: str


# ---------- ANC visit ----------
class ANCVisitCreate(CamelModel):
    pregnancy_id: str
    patient_id: str
    doctor_id: str
    date: str
    weeks: int = 0
    weight: float = 0
    systolic: int = 0
    diastolic: int = 0
    fundal_height: float = 0
    hemoglobin: float = 0
    fetal_heart_rate: int = 0
    notes: str = ""


class ANCVisitOut(CamelModel):
    id: str
    hospital_id: Optional[str] = None
    pregnancy_id: str
    patient_id: str
    doctor_id: str
    date: str
    weeks: int = 0
    weight: float = 0
    systolic: int = 0
    diastolic: int = 0
    fundal_height: float = 0
    hemoglobin: float = 0
    fetal_heart_rate: int = 0
    notes: str = ""
    created_at: str


# ---------- Baby / growth / immunization ----------
class BabyCreate(CamelModel):
    mother_patient_id: str
    pregnancy_id: Optional[str] = None
    name: str
    date_of_birth: str
    sex: BabySex = "female"
    birth_weight: float = 0
    birth_length: float = 0
    head_circumference: float = 0
    delivery_type: DeliveryType = "normal"
    gestational_weeks: int = 0


class BabyOut(CamelModel):
    id: str
    hospital_id: Optional[str] = None
    mother_patient_id: str
    pregnancy_id: Optional[str] = None
    name: str
    date_of_birth: str
    sex: BabySex = "female"
    birth_weight: float = 0
    birth_length: float = 0
    head_circumference: float = 0
    delivery_type: DeliveryType = "normal"
    gestational_weeks: int = 0
    created_at: str


class GrowthMeasurementCreate(CamelModel):
    date: str
    weight: float = 0
    height: float = 0
    head_circumference: float = 0


class GrowthMeasurementOut(CamelModel):
    id: str
    hospital_id: Optional[str] = None
    baby_id: str
    date: str
    weight: float = 0
    height: float = 0
    head_circumference: float = 0
    created_at: str


class ImmunizationCreate(CamelModel):
    vaccine: str
    age_label: str = ""
    due_date: str
    status: ImmunizationStatus = "pending"
    given_date: Optional[str] = None


class ImmunizationMarkGiven(CamelModel):
    given_date: str


class ImmunizationOut(CamelModel):
    id: str
    hospital_id: Optional[str] = None
    baby_id: str
    vaccine: str
    age_label: str = ""
    due_date: str
    status: ImmunizationStatus = "pending"
    given_date: Optional[str] = None
    created_at: str


# ---------- Auth response (mirrors authOperations.AuthSession) ----------
class AuthResponse(CamelModel):
    user: UserOut
    patient: Optional[PatientOut] = None
    # The signer's role record, so the client knows where to send them without
    # hardcoding a role -> route map. Included here because the login page has no
    # token yet and so cannot read the role catalog.
    role: Optional[RoleOptionOut] = None
    # What this user may actually do here: their role's grants intersected with
    # the hospital's enabled modules. Sent on every auth response rather than
    # baked into the JWT, so a superadmin's change takes effect immediately.
    permissions: List[PermissionGrant] = []
    token: str
    is_authenticated: bool = True
