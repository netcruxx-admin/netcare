from typing import List, Literal, Optional, get_args

from pydantic import BaseModel, ConfigDict, ValidationInfo, field_validator
from pydantic.alias_generators import to_camel
from pydantic_core import PydanticUndefined

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


# Empty value to substitute when a NULL column meets a non-optional field.
_EMPTY_FOR_TYPE: dict[type, object] = {str: "", int: 0, float: 0.0, bool: False, dict: {}, list: []}


class OutModel(CamelModel):
    """Base for response models: a NULL column never fails a read.

    Most nullable columns are declared non-optional here because the app always
    writes "" or 0 through the ORM. That default is client-side though — a
    direct SQL insert, a bulk insert in a migration, or an imported row writes a
    real NULL, and strict validation would then turn one bad row into a 500 for
    the *entire* list endpoint, not just that record.

    So responses coerce NULL to the field's declared default, or to the empty
    value for its type. Requests deliberately do NOT inherit this: input stays
    strict, because a client sending null for a required field is a bug worth
    rejecting. Tolerant on the way out, strict on the way in.
    """

    @field_validator("*", mode="before")
    @classmethod
    def _null_to_empty(cls, value: object, info: ValidationInfo) -> object:
        if value is not None:
            return value
        field = cls.model_fields.get(info.field_name or "")
        if field is None:
            return value
        # A field that genuinely accepts None keeps it.
        if type(None) in get_args(field.annotation):
            return value
        # Prefer what the schema already declares (keeps Literals valid, e.g.
        # status defaulting to "ordered" rather than an invalid "").
        if field.default is not PydanticUndefined:
            return field.default
        # A Literal with no default: fall back to its first member, which is the
        # initial state by convention ("scheduled", "pending", "ordered").
        # Better a defensible starting value than a 500 on the whole list.
        literal_options = get_args(field.annotation)
        if literal_options and all(isinstance(o, str) for o in literal_options):
            return literal_options[0]
        return _EMPTY_FOR_TYPE.get(field.annotation, value)


# ---------- Hospital (tenant) ----------
class HospitalOut(OutModel):
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
class PermissionOut(OutModel):
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
class RoleOut(OutModel):
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


class RoleOptionOut(OutModel):
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


class UserOut(OutModel):
    id: str
    hospital_id: Optional[str] = None
    email: str
    name: str
    phone: str = ""
    role: Role
    created_at: str


# ---------- Patient ----------
class PatientOut(OutModel):
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
    # Appointment aggregates, present only when the caller asks for withStats.
    # Absent (0/None) otherwise, so the common read stays cheap.
    visit_count: int = 0
    last_visit: Optional[str] = None
    next_visit: Optional[str] = None
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


class DoctorOut(OutModel):
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


class DoctorAvailabilityOut(OutModel):
    """What a booker needs to pick a slot, and nothing more: the times already
    taken and the doctor's blocks. Deliberately carries no appointment detail,
    so it is safe for a patient who cannot read other people's bookings."""

    doctor_id: str
    date: str
    taken: List[str] = []
    blocks: List["ScheduleBlockOut"] = []


# ---------- Department ----------
class DepartmentOut(OutModel):
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


class AppointmentOut(OutModel):
    id: str
    hospital_id: Optional[str] = None
    patient_id: str
    doctor_id: str
    department_id: str
    date: str
    time: str
    status: AppointmentStatus = "scheduled"
    mode: AppointmentMode = "in-person"
    reason: str = ""
    notes: str = ""
    follow_up_of: Optional[str] = None
    rescheduled: bool = False
    created_at: str
    # Display fields resolved server-side. Without them a table of appointments
    # has to fetch every patient in the hospital just to turn an id into a name,
    # which defeats paging the appointments themselves.
    patient_name: str = ""
    patient_phone: str = ""
    doctor_name: str = ""
    #: Whether vitals have been recorded against this appointment.
    has_vitals: bool = False


class AppointmentStatsOut(OutModel):
    """Counts across the caller's whole visible set, for the summary tiles."""

    total: int = 0
    scheduled: int = 0
    completed: int = 0
    cancelled: int = 0
    rescheduled: int = 0


# ---------- Medical Record ----------
class MedicalRecordCreate(CamelModel):
    patient_id: str
    appointment_id: str
    doctor_id: str
    diagnosis: str = ""
    prescription: str = ""
    lab_reports: List[str] = []


class MedicalRecordOut(OutModel):
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


class PaymentOut(OutModel):
    id: str
    appointment_id: str
    patient_id: str
    amount: float
    status: PaymentStatus = "pending"
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


class PrescriptionOut(OutModel):
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
    # Resolved server-side, for the same reason as AppointmentOut.
    patient_name: str = ""


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


class VitalsOut(OutModel):
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
    # Resolved server-side, for the same reason as AppointmentOut.
    patient_name: str = ""


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


class MedicineOut(OutModel):
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


class LabTestOut(OutModel):
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


class TestOrderOut(OutModel):
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
    # Resolved server-side, for the same reason as AppointmentOut.
    patient_name: str = ""
    #: Whether a report has been entered for this order.
    has_results: bool = False
    #: Whether any reported parameter carries a non-normal flag.
    abnormal: bool = False
    #: When the report was filed, and by whom. Empty until one exists.
    reported_at: str = ""
    reported_by: str = ""


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


class TestResultOut(OutModel):
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


class ScheduleBlockOut(OutModel):
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


class VideoSlotOut(OutModel):
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


class PregnancyOut(OutModel):
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
    # Resolved server-side, for the same reason as AppointmentOut: the card
    # shows the mother's name, how many antenatal visits there have been, and
    # the newest visit's readings (which drive the risk flags). Deriving them in
    # the client means holding every patient and every ANC visit in memory.
    patient_name: str = ""
    visit_count: int = 0
    latest_visit: Optional["ANCVisitOut"] = None


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


class ANCVisitOut(OutModel):
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


# PregnancyOut refers to ANCVisitOut, which is only defined now.
PregnancyOut.model_rebuild()


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


class BabyOut(OutModel):
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
    # Resolved server-side, for the same reason as AppointmentOut.
    mother_name: str = ""


class GrowthMeasurementCreate(CamelModel):
    date: str
    weight: float = 0
    height: float = 0
    head_circumference: float = 0


class GrowthMeasurementOut(OutModel):
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


class ImmunizationOut(OutModel):
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
