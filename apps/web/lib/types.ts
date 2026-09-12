// -----------------------------------------------------------------------------
// Shared domain types — the single home for every interface / type used across
// the app's data model, auth, hospital config and feature modules.
//
// Definitions live here; each module re-exports the ones it owns (e.g. db.ts
// re-exports the record types) so existing `import { X } from '@/lib/db'` paths
// keep working. Import from a module's own barrel or from '@/lib/types' directly.
// -----------------------------------------------------------------------------

import type { LucideIcon } from 'lucide-react';

// == Core records =============================================================

export interface User {
  id: string;
  // Tenant this row belongs to. Optional so responses that omit it and
  // partially-built objects stay valid; it's stamped automatically on write.
  hospitalId?: string;
  email: string;
  password: string;
  name: string;
  phone?: string;
  // Any code in the backend `roles` table. Not a closed union: the catalog is
  // superadmin-managed at runtime, so custom roles are valid here. Match against
  // the fetched catalog rather than writing exhaustive switches on this.
  role: string;
  createdAt: string;
}

export interface Patient {
  id: string;
  hospitalId?: string;
  userId: string;
  phone: string;
  dateOfBirth: string;
  gender: string;
  bloodGroup: string;
  /** The "W/O / D/O / B/O" identity line: relationType is
   *  "wife_of" | "daughter_of" | "baby_of" (or ""), relationName the relative. */
  relationType: string;
  relationName: string;
  allergies: string;
  chronicDiseases: string;
  emergencyContact: string;
  emergencyPhone: string;
  /** How the emergency contact is related to the patient, e.g. "Spouse". */
  emergencyRelationship: string;
  medicalHistory: string;
  insuranceProvider: string;
  insuranceNumber: string;
  /** Twelve digits, or "" when not given. Optional by design — a hospital may
   *  not refuse care for want of one — and validated when it is: its purpose is
   *  recognising a returning patient, and a mistyped number recognises nobody. */
  aadhaarNumber: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  district: string;
  state: string;
  pincode: string;
  country: string;
  documents: string[];
  /** Appointment aggregates — populated only when the list is fetched with
   *  withStats=true, so the cheap reads stay cheap. */
  visitCount?: number;
  lastVisit?: string | null;
  nextVisit?: string | null;
  /** Set when the patient has an active pregnancy record and the caller holds
   *  pregnancies.read — absent otherwise, never inferred client-side. */
  activePregnancy?: ActivePregnancySummary | null;
  user?: User;
}

/** The minimum a patient chart or patient list needs to know about a pregnancy
 *  without a second trip to /pregnancies. */
export interface ActivePregnancySummary {
  id: string;
  lmp: string;
  edd: string;
  gravida: number;
  para: number;
  riskFactors: string[];
}

export interface Doctor {
  id: string;
  hospitalId?: string;
  userId: string;
  departmentId?: string;
  qualification: string;
  specialization: string;
  experienceYears: number;
  availableSlots: TimeSlot[];
  user?: User;
  // Medical council credentials (collected at registration). Optional so
  // existing/seeded doctors remain valid.
  licenseNumber?: string;
  medicalCouncil?: string;
  registrationYear?: string;
  // 'verified' for legacy/seeded doctors; self-registered doctors start
  // 'pending' until an admin (or a council/KYC integration) approves them.
  verificationStatus?: 'pending' | 'verified' | 'rejected';
}

export interface TimeSlot {
  date: string;
  startTime: string;
  endTime: string;
  available: boolean;
}

export interface Appointment {
  id: string;
  hospitalId?: string;
  patientId: string;
  doctorId: string;
  departmentId: string;
  date: string;
  time: string;
  status: 'scheduled' | 'completed' | 'cancelled';
  // How the visit happens. Absent/'in-person' for older data; 'video' for
  // teleconsultations booked against a doctor's published video slots.
  mode?: 'in-person' | 'video';
  reason: string;
  notes: string;
  rescheduled?: boolean;
  /** Which published price this visit is billed at — the `visitType` of a
   *  ConsultationFee. The client names the kind of visit; the server prices it. */
  visitType?: string;
  /** Display fields resolved server-side, so a table needn't fetch every
   *  patient and doctor just to turn ids into names. */
  patientName?: string;
  patientPhone?: string;
  doctorName?: string;
  /** Whether vitals have been recorded against this appointment. */
  hasVitals?: boolean;
  /** The consultation bill for this visit, answered on the appointment so a
   *  list can show paid/unpaid without reading the payments ledger. Empty
   *  `paymentStatus` means no bill was raised — not the same as unpaid. */
  paymentStatus?: string;
  paymentAmount?: number;
  paymentMethod?: string;
  paymentId?: string;
  // Set when this appointment was booked as a follow-up to an earlier one.
  followUpOf?: string;
  createdAt: string;
}

export interface Department {
  id: string;
  hospitalId?: string;
  name: string;
  description: string;
}

export interface MedicalRecord {
  id: string;
  hospitalId?: string;
  patientId: string;
  appointmentId: string;
  doctorId: string;
  diagnosis: string;
  /** Free-text clinical advice. `treatmentAdvice` was previously `prescription`. */
  treatmentAdvice: string;
  followUpAdvice: string;
  labReports: string[];
  /** New-visit history-taking — blank on a follow-up note. */
  chiefComplaint: string;
  medicalHistory: string;
  surgicalHistory: string;
  familyHistory: string;
  /** LMP itself lives only on Vitals — see Vitals.lmp — so the two can't
   *  disagree. This is the ultrasound-derived POG, deliberately separate from
   *  Vitals' LMP-derived one; the two dating methods often differ. */
  menstrualHistory: string;
  maritalStatus: string;
  obstetricHistory: string;
  pogByScan: string;
  /** Examination findings, taken at every antenatal visit — not new-visit-only. */
  perAbdomen: string;
  perSpeculum: string;
  perVaginum: string;
  createdAt: string;
}

export interface Payment {
  id: string;
  hospitalId?: string;
  appointmentId?: string | null;
  medicationOrderId?: string | null;
  injectionOrderId?: string | null;
  testOrderId?: string | null;
  patientId: string;
  amount: number;
  paymentType: 'consultation' | 'pharmacy' | 'lab' | 'injectable';
  status: 'pending' | 'completed' | 'failed';
  paymentMethod: string;
  gatewayOrderId?: string | null;
  gatewayPaymentId?: string | null;
  createdAt: string;
}

export interface PharmacyBillOut {
  payment: Payment;
  amount: number;
  medicineName: string;
  quantity: number;
  unitPrice: number;
}

export interface PharmacyBillingRow {
  paymentId: string;
  invoiceNumber: string;
  createdAt: string;
  patientName: string;
  patientPhone: string;
  medicineName: string;
  dosage: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  paymentMethod: string;
}

export interface PharmacyBillingSummary {
  date: string;
  rows: PharmacyBillingRow[];
  total: number;
  cashTotal: number;
  upiTotal: number;
  cardTotal: number;
  billCount: number;
}

export interface InjectableLabBillingRow {
  paymentId: string;
  invoiceNumber: string;
  createdAt: string;
  patientName: string;
  patientPhone: string;
  category: 'injectable' | 'lab';
  description: string;
  quantity: number;
  amount: number;
  status: string;
  paymentMethod: string;
}

export interface InjectableLabBillingSummary {
  date: string;
  rows: InjectableLabBillingRow[];
  total: number;
  cashTotal: number;
  upiTotal: number;
  cardTotal: number;
  /** Billed but not yet collected — what the desk still has to chase. */
  pendingTotal: number;
  billCount: number;
}

export interface ConsultationBillingRow {
  paymentId: string;
  invoiceNumber: string;
  createdAt: string;
  patientName: string;
  patientPhone: string;
  doctorName: string;
  departmentName: string;
  visitType: string;
  visitTypeLabel: string;
  appointmentDate: string;
  appointmentTime: string;
  amount: number;
  status: string;
  paymentMethod: string;
}

export interface ConsultationBillingSummary {
  date: string;
  rows: ConsultationBillingRow[];
  total: number;
  cashTotal: number;
  upiTotal: number;
  cardTotal: number;
  /** Billed but not yet collected — what the desk still has to chase. */
  pendingTotal: number;
  billCount: number;
}

/** What a hospital charges for a kind of visit. Price lives here, not on the
 *  doctor: a consultation is priced by what it is, not by who gives it. */
export interface ConsultationFee {
  id: string;
  hospitalId?: string;
  /** Stable key an appointment records; survives relabelling. */
  visitType: string;
  label: string;
  amount: number;
  active: boolean;
  sortOrder: number;
  createdAt?: string;
}

/** Returned by POST /payments/initiate — everything needed to open Razorpay checkout. */
export interface PaymentInitiateOut {
  orderId: string;
  amount: number;       // INR, for display
  amountPaise: number;  // paise, passed to Razorpay as `amount`
  currency: string;
  keyId: string;
}

/** Returned by POST /payments/verify — the newly-created appointment and payment. */
export interface PaymentVerifyOut {
  appointment: Appointment;
  payment: Payment;
}

export interface Prescription {
  id: string;
  hospitalId?: string;
  appointmentId: string;
  patientId: string;
  doctorId: string;
  medicineName: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions: string;
  createdAt: string;
  /** Resolved by the API, so a table need not fetch every patient to name one. */
  patientName?: string;
}

export interface Vitals {
  id: string;
  hospitalId?: string;
  appointmentId: string;
  patientId: string;
  doctorId: string;
  temperature: number;
  bloodPressure: string;
  heartRate: number;
  /** Still returned for historical rows; no longer captured by the vitals form. */
  respiratoryRate: number;
  weight: number;
  height: number;
  /** Auto-filled from height/weight, editable. */
  bmi: number;
  /** Obstetric triad — last menstrual period / expected date of delivery /
   *  period of gestation, e.g. "28w 3d". EDD/POG are only meaningful when
   *  `pregnancyStatus` is "pregnant" — LMP alone does not imply pregnancy,
   *  and a blank LMP does not imply menopause, so neither is inferred from it. */
  lmp: string;
  edd: string;
  pog: string;
  /** "" (not recorded) | "pregnant" | "not_pregnant" | "menopause". */
  pregnancyStatus: string;
  notes: string;
  createdAt: string;
  /** Resolved by the API, so a table need not fetch every patient to name one. */
  patientName?: string;
}

export interface Medicine {
  id: string;
  hospitalId?: string;
  name: string;
  category: string;
  form: string;
  strength: string;
  price: number;
  stock: number;
  lotNumber?: string;
  expiryDate?: string;
  reorderLevel?: number;
  location?: string;
  unit?: string;
}

export type MedicationOrderStatus = 'pending' | 'dispensed' | 'administered' | 'cancelled';

export interface MedicationOrder {
  id: string;
  hospitalId?: string;
  appointmentId?: string | null;
  patientId: string;
  doctorId: string;
  /** The prescription this order was raised from, when it came from one. */
  prescriptionId?: string;
  medicineId?: string;
  medicineName: string;
  /** Units to hand over. Inventory moves by this, not by parsing the free-text
   *  dosage/frequency/duration below. */
  quantity: number;
  dosage: string;
  route: string;
  frequency: string;
  duration: string;
  instructions: string;
  status: MedicationOrderStatus;
  notes: string;
  orderedAt: string;
  patientName?: string;
  patientPhone?: string;
  doctorName?: string;
  /** Unit price from medicine catalogue; 0 for free-text orders. */
  unitPrice: number;
  /** True when a pharmacy payment record already exists for this order. */
  alreadyBilled: boolean;
}

export type InventoryMovementType = 'restock' | 'dispense' | 'expired' | 'returned' | 'adjustment';

export interface InventoryMovement {
  id: string;
  hospitalId?: string;
  medicineId: string;
  movementType: InventoryMovementType;
  quantity: number;
  lotNumber: string;
  expiryDate: string;
  referenceId: string;
  performedBy: string;
  notes: string;
  createdAt: string;
  medicineName?: string;
  performedByName?: string;
}

// ── Injections ──────────────────────────────────────────────────────────────
// The injectable-shot mirror of Medicine / MedicationOrder / InventoryMovement.
// A single-dose injectable is consumed when it is given, so there is no
// pharmacist dispense step: the doctor orders, the nurse administers, and the
// administration moves stock.

export const INJECTION_ROUTES = ['IM', 'IV', 'SC', 'ID'] as const;
export type InjectionRoute = (typeof INJECTION_ROUTES)[number];

/** A stocked injectable product — the InjectionOrder's Medicine. */
export interface Injectable {
  id: string;
  hospitalId?: string;
  name: string;
  category: string;
  form: string;        // vial | ampoule | prefilled syringe
  strength: string;    // "1 g", "0.5 mL"
  route: string;       // default route for this product
  price: number;
  stock: number;       // vials/ampoules on hand
  reorderLevel: number;
  lotNumber: string;
  expiryDate: string;
  location: string;
  unit: string;
}

export type InjectionOrderStatus = 'ordered' | 'administered' | 'cancelled';

export interface InjectionOrder {
  id: string;
  hospitalId?: string;
  appointmentId?: string | null;
  patientId: string;
  doctorId: string;
  prescriptionId?: string | null;
  /** Catalogue link. Null for a free-text order, which moves no stock. */
  injectableId?: string | null;
  injectableName: string;
  dose: string;
  route: string;
  /** Vials/ampoules the administration consumes. */
  quantity: number;
  scheduledFor: string;
  instructions: string;
  status: InjectionOrderStatus;
  /** Filled by the nurse at administration. */
  site: string;
  notes: string;
  administeredBy?: string | null;
  administeredAt?: string | null;
  orderedAt: string;
  patientName?: string;
  patientPhone?: string;
  doctorName?: string;
  administeredByName?: string;
  /** Catalogue stock on hand right now, so the queue can flag an un-giveable shot. */
  stockOnHand?: number | null;
}

export type InjectionMovementType = 'restock' | 'administer' | 'adjustment' | 'expired';

export interface InjectionStockMovement {
  id: string;
  hospitalId?: string;
  injectableId: string;
  movementType: InjectionMovementType;
  quantity: number;
  lotNumber: string;
  expiryDate: string;
  referenceId: string;
  performedBy: string;
  notes: string;
  createdAt: string;
  injectableName?: string;
  performedByName?: string;
}

export interface TestParameterTemplate {
  name: string;
  unit: string;
  referenceRange: string;
  low?: number;
  high?: number;
}

export interface LabTest {
  id: string;
  hospitalId?: string;
  name: string;
  category: string;
  sampleType: string;
  price: number;
  turnaroundTime: string;
  // Optional result template so lab staff get pre-filled parameter rows.
  parameters?: TestParameterTemplate[];
}

// == Scheduling ===============================================================

export type BlockType = 'break' | 'ot' | 'block';

export interface ScheduleBlock {
  id: string;
  hospitalId?: string;
  doctorId: string;
  date: string;       // YYYY-MM-DD
  startTime: string;  // slot label, e.g. "10:00 AM"
  endTime: string;    // slot label (exclusive), e.g. "11:00 AM"
  type: BlockType;
  note: string;
  createdAt: string;
}

// == Lab orders / results =====================================================

export type TestOrderStatus =
  | 'ordered'
  | 'sample_collected'
  | 'in_progress'
  | 'completed'
  | 'reviewed';

export interface TestOrderItem {
  testId: string;
  name: string;
  price: number;
}

export interface TestOrder {
  id: string;
  hospitalId?: string;
  patientId: string;
  doctorId: string;
  appointmentId?: string;
  items: TestOrderItem[];
  status: TestOrderStatus;
  priority: 'routine' | 'urgent';
  clinicalNote: string;
  orderedAt: string;
  updatedAt: string;
  /** Resolved server-side, for the same reason as Appointment.patientName. */
  patientName?: string;
  /** Whether a report has been entered for this order. */
  hasResults?: boolean;
  /** Whether any reported parameter carries a non-normal flag. */
  abnormal?: boolean;
  /** When the report was filed and by whom; empty until one exists. */
  reportedAt?: string;
  reportedBy?: string;
}

export interface TestResultParameter {
  name: string;
  value: string;
  unit: string;
  referenceRange: string;
  flag: 'normal' | 'low' | 'high' | 'critical';
}

export interface TestResult {
  id: string;
  hospitalId?: string;
  orderId: string;
  testId: string;
  testName: string;
  parameters: TestResultParameter[];
  remarks: string;
  reportedBy: string;
  reportedAt: string;
}

/** A lab result parameter's abnormal-value flag. */
export type ResultFlag = TestResultParameter['flag'];

// == Newborn / baby ===========================================================

// Newborn / baby record — created after delivery, linked to the mother.
export interface Baby {
  id: string;
  hospitalId?: string;
  motherPatientId: string;
  pregnancyId?: string;
  name: string;
  dateOfBirth: string;               // YYYY-MM-DD
  sex: 'male' | 'female';
  birthWeight: number;               // kg
  birthLength: number;               // cm
  headCircumference: number;         // cm
  deliveryType: 'normal' | 'c-section' | 'assisted';
  gestationalWeeks: number;
  /** Resolved by the API, so a list needn't fetch every patient to name one. */
  motherName?: string;
  createdAt: string;
}

// A growth measurement point (weight / length / head circumference over time).
export interface GrowthMeasurement {
  id: string;
  hospitalId?: string;
  babyId: string;
  date: string;                      // YYYY-MM-DD
  weight: number;                    // kg
  height: number;                    // cm
  headCircumference: number;         // cm
  createdAt: string;
}

// A scheduled immunization for a baby (generated from the IAP schedule at birth).
export interface Immunization {
  id: string;
  hospitalId?: string;
  babyId: string;
  vaccine: string;
  ageLabel: string;                  // e.g. "At birth", "6 weeks"
  dueDate: string;                   // YYYY-MM-DD
  status: 'pending' | 'given';
  givenDate?: string;
  createdAt: string;
}

/** A dose in the IAP immunization schedule. */
export interface VaccineDose {
  vaccine: string;
  ageLabel: string;
  ageDays: number;
}

export type ImmStatus = 'given' | 'overdue' | 'due' | 'upcoming';

/** A point on the WHO weight-for-age percentile reference. */
export interface WhoPoint {
  month: number;
  p3: number;
  p50: number;
  p97: number;
}

// == Telemedicine =============================================================

// A video-consultation slot a doctor publishes as available. Patients book an
// open slot, which creates a `mode: 'video'` appointment and flips it to booked.
export interface VideoSlot {
  id: string;
  hospitalId?: string;
  doctorId: string;
  date: string;   // YYYY-MM-DD
  time: string;   // slot label, e.g. "10:30 AM"
  status: 'open' | 'booked';
  appointmentId?: string;
  createdAt: string;
}

// == Maternity / ANC ==========================================================

// Maternity ANC (antenatal care) — one pregnancy record per patient, plus a
// series of antenatal visits. Only used when the `anc` module is enabled.
export interface PregnancyRecord {
  id: string;
  hospitalId?: string;
  patientId: string;
  lmp: string;                 // last menstrual period (YYYY-MM-DD)
  edd: string;                 // estimated due date (YYYY-MM-DD)
  gravida: number;             // total number of pregnancies incl. current
  para: number;                // number of prior births
  height: number;              // cm
  prePregnancyWeight: number;  // kg
  bloodGroup: string;
  riskFactors: string[];
  status: 'active' | 'delivered' | 'closed';
  notes: string;
  createdAt: string;
  /** Resolved by the API: the mother's name, how many antenatal visits there
   *  have been, and the newest visit (whose readings drive the risk flags). */
  patientName?: string;
  visitCount?: number;
  latestVisit?: ANCVisit | null;
}

export interface ANCVisit {
  id: string;
  hospitalId?: string;
  pregnancyId: string;
  patientId: string;
  doctorId: string;
  date: string;                // YYYY-MM-DD
  weeks: number;               // gestational weeks at the visit
  weight: number;              // kg
  systolic: number;            // mmHg
  diastolic: number;           // mmHg
  fundalHeight: number;        // cm
  hemoglobin: number;          // g/dL
  fetalHeartRate: number;      // bpm
  notes: string;
  createdAt: string;
}

/** Gestational age broken into weeks + days (and total days) from the LMP. */
export interface GestationalAge {
  weeks: number;
  days: number;
  totalDays: number;
}

/** A recommended antenatal milestone (India / WHO-aligned schedule). */
export interface Milestone {
  week: number;
  label: string;
}

/** A clinical risk flag derived from a pregnancy record and its latest visit. */
export interface RiskFlag {
  level: 'warning' | 'critical';
  label: string;
  detail: string;
}

// == Auth =====================================================================

export interface AuthSession {
  user: User;
  patient?: Patient;
  /** Tenant the authenticated user belongs to (mirror of user.hospitalId). */
  hospitalId: string;
  /** The user's role record from the backend catalog, including the dashboard
   *  it lands on. Optional so pre-existing stored sessions stay valid. */
  role?: { code: string; label: string; homePath: string };
  /** What this user may do, as resolved by the server (role grants ∩ the
   *  hospital's modules). Never computed on the client. */
  permissions?: { code: string; scope?: 'own' | 'all' | null }[];
  /** Short-lived access token (minutes). Renewed silently by store/baseQuery. */
  token: string;
  /** Opaque, long-lived, and the only thing that can mint a new access token.
   *  Rotates on every use, so whatever came back last is the one to keep.
   *  Optional so a session stored before this existed still parses — it will
   *  simply fail to renew once, and sign the user in again. */
  refreshToken?: string;
  /** True when this password was chosen by somebody else. The API refuses every
   *  permission-guarded endpoint until it is replaced, so the app diverts to the
   *  change screen instead of pretending the sign-in finished. */
  mustChangePassword?: boolean;
  isAuthenticated: boolean;
}

// Role-specific fields captured on the final step of the registration wizard.
export interface PatientDetails {
  dateOfBirth?: string;
  gender?: string;
  bloodGroup?: string;
  relationType?: string;
  relationName?: string;
  allergies?: string;
  chronicDiseases?: string;
  emergencyContact?: string;
  emergencyPhone?: string;
  emergencyRelationship?: string;
  insuranceProvider?: string;
  insuranceNumber?: string;
  aadhaarNumber?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  district?: string;
  state?: string;
  pincode?: string;
  country?: string;
}

export interface DoctorDetails {
  licenseNumber?: string;
  medicalCouncil?: string;
  registrationYear?: string;
  qualification?: string;
  specialization?: string;
  experienceYears?: number;
}

export type RegisterDetails = PatientDetails | DoctorDetails;

// == Hospital modules =========================================================
//
// The hospital record itself (id, name, subdomain, category, theme, modules)
// is HospitalInfo in store/api.ts — it comes from GET /hospitals/current and is
// not modelled locally.

/** Which optional feature-modules a hospital has switched on. */
export interface HospitalModules {
  lab: boolean;            // diagnostics: lab orders, results, test catalog
  pharmacy: boolean;       // prescriptions + medicine catalog
  nursing: boolean;        // nurse role: vitals station
  payments: boolean;       // billing / payments
  medicalRecords: boolean; // clinical records + history
  telemedicine: boolean;   // video consults (future)
  anc: boolean;            // antenatal / pregnancy tracker (maternity-only, future)
}

// == Hospital categories (vertical templates) =================================

export type HospitalCategoryId =
  | 'maternity'
  | 'multi-specialty'
  | 'dental'
  | 'eye'
  | 'diagnostic';

/** A headline feature that defines a vertical. `built` marks whether the
 *  feature actually exists yet vs. being on the roadmap (shown as "coming
 *  soon" in the UI). */
export interface CategoryFeature {
  label: string;
  description: string;
  built: boolean;
}

export interface HospitalCategory {
  id: HospitalCategoryId;
  label: string;
  tagline: string;
  icon: LucideIcon;
  description: string;
  /** Feature-modules switched on for this vertical (gates nav + features). */
  modules: HospitalModules;
  specializations: string[];
  /** Suggested department template for this vertical. */
  departments: Department[];
  /** Differentiating features highlighted during onboarding. */
  signatureFeatures: CategoryFeature[];
}


// ---------------------------------------------------------------------------
// Consent (DPDP 2023). Mirrors apps/api/app/schemas.py.
// ---------------------------------------------------------------------------

/** One thing the hospital may ask to do with a person's data.
 *
 *  Code-owned and versioned on the backend, so the wording shown here is a row
 *  the API returns rather than copy living in this bundle — the text a patient
 *  agreed to has to be reproducible later, and a string in the frontend that
 *  changed on the next deploy would not be. */
export interface ConsentPurpose {
  code: string;
  label: string;
  notice: string;
  version: number;
  /** True when care genuinely cannot be delivered without it. Everything else
   *  must be refusable without losing care, which is why the form separates
   *  them rather than presenting one tickbox. */
  required: boolean;
  module: string | null;
  /** `per_person` is settled at sign-up; `per_event` is asked each time (a
   *  teleconsultation, under the Telemedicine Practice Guidelines 2020). */
  cadence: 'per_person' | 'per_event';
  sortOrder: number;
}

export interface Consent {
  id: string;
  subjectUserId: string;
  purposeCode: string;
  version: number;
  method: 'explicit' | 'implied_patient_initiated';
  recordedByUserId: string | null;
  guardianUserId: string | null;
  guardianName: string;
  guardianRelationship: string;
  appointmentId: string | null;
  grantedAt: string;
  withdrawnAt: string | null;
  /** Set when the notice has been reworded since this was given, so the UI can
   *  re-ask. Not treated as withdrawn — that would stop care over a typo fix. */
  stale: boolean;
  purposeLabel: string;
}
