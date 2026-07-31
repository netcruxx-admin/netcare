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
  // Tenant this row belongs to. Optional so older localStorage snapshots and
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
  allergies: string;
  chronicDiseases: string;
  emergencyContact: string;
  emergencyPhone: string;
  medicalHistory: string;
  insuranceProvider: string;
  insuranceNumber: string;
  documents: string[];
  user?: User;
}

export interface Doctor {
  id: string;
  hospitalId?: string;
  userId: string;
  qualification: string;
  specialization: string;
  experienceYears: number;
  consultationFee: number;
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
  prescription: string;
  labReports: string[];
  createdAt: string;
}

export interface Payment {
  id: string;
  hospitalId?: string;
  appointmentId: string;
  patientId: string;
  amount: number;
  status: 'pending' | 'completed' | 'failed';
  paymentMethod: string;
  createdAt: string;
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
  respiratoryRate: number;
  weight: number;
  height: number;
  notes: string;
  createdAt: string;
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
  token: string;
  isAuthenticated: boolean;
}

// Role-specific fields captured on the final step of the registration wizard.
export interface PatientDetails {
  dateOfBirth?: string;
  gender?: string;
  bloodGroup?: string;
  allergies?: string;
  chronicDiseases?: string;
  emergencyContact?: string;
  emergencyPhone?: string;
  insuranceProvider?: string;
  insuranceNumber?: string;
}

export interface DoctorDetails {
  licenseNumber?: string;
  medicalCouncil?: string;
  registrationYear?: string;
  qualification?: string;
  specialization?: string;
  experienceYears?: number;
  consultationFee?: number;
}

export type RegisterDetails = PatientDetails | DoctorDetails;

// == Hospital config / tenancy ================================================

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

export interface HospitalConfig {
  /** Stable id — the tenant key stamped onto every row (`hospitalId`). */
  id: string;
  /** Subdomain label this tenant is served on, e.g. "sunrise" → sunrise.host. */
  subdomain: string;
  name: string;
  tagline: string;
  /** Hospital vertical — drives which template/catalog/modules make sense. */
  type: 'maternity' | 'multi-specialty' | 'dental' | 'eye' | 'diagnostic';
  currency: string; // ISO 4217, e.g. "INR"
  /** Branding colors. Exposed for future CSS-variable theming / white-labeling. */
  theme: {
    primary: string;
    primaryDark: string;
  };
  modules: HospitalModules;
  /** Specializations doctors can be assigned to (was free-text in seed data). */
  specializations: string[];
  /** Seed catalog — departments/medicines/tests this hospital offers. Used to
   *  populate a fresh database; admins can then edit via the admin UI. */
  departments: Department[];
  medicines: Medicine[];
  labTests: LabTest[];
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

// == Notifications ============================================================

export type NotificationTone = 'info' | 'success' | 'warning';

export interface AppNotification {
  id: string;
  title: string;
  description: string;
  time: string; // ISO
  href?: string;
  tone: NotificationTone;
}

// == Verification registries (mock KYC services) ==============================

export interface DoctorRegistryRecord {
  registrationNumber: string;
  name: string;
  qualification: string;
  specialization: string;
  medicalCouncil: string;
  registrationYear: string;
  /** Council standing — a real API would return this too. */
  status: 'active' | 'suspended';
}

export interface NurseRegistryRecord {
  registrationNumber: string;
  name: string;
  qualification: string;
  nursingCouncil: string;
  registrationYear: string;
  /** Council standing. */
  status: 'active' | 'suspended';
}

export interface AadhaarRecord {
  aadhaarNumber: string;
  name: string;
  /** ISO date (YYYY-MM-DD). */
  dateOfBirth: string;
  /** Matches the app's gender options: 'Female' | 'Male' | 'Other'. */
  gender: string;
  phone: string;
  address: string;
}
