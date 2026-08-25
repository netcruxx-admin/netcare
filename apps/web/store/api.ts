import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQueryWithReauth } from './baseQuery';
import type {
  ANCVisit,
  Appointment,
  Baby,
  Consent,
  ConsentPurpose,
  Department,
  Doctor,
  GrowthMeasurement,
  Immunization,
  InventoryMovement,
  LabTest,
  MedicalRecord,
  MedicationOrder,
  Medicine,
  Patient,
  Payment,
  PaymentInitiateOut,
  PaymentVerifyOut,
  PharmacyBillOut,
  PregnancyRecord,
  Prescription,
  ScheduleBlock,
  TestOrder,
  TestResult,
  User,
  Vitals,
  VideoSlot,
} from '@/lib/types';
import { AUTH_SESSION_KEY } from '@/lib/constants';
import { getCurrentHospitalId } from '@/lib/tenant';

// ---------------------------------------------------------------------------
// Auth session shape returned by the real backend
// ---------------------------------------------------------------------------
export interface ApiAuthResponse {
  user: User;
  patient?: Patient;
  /** The signer's role record, including the dashboard it lands on. Optional
   *  because the field is only present on a backend that has the roles table. */
  role?: RoleOption;
  /** What this user may actually do: their role's grants intersected with the
   *  hospital's enabled modules, resolved server-side on every auth response. */
  permissions?: PermissionGrant[];
  token: string;
  /** Absent on /auth/me, which reports an existing session rather than opening
   *  one and so has no new refresh token to hand out. */
  refreshToken?: string;
  expiresIn?: number;
  isAuthenticated: boolean;
}

/** Where a tenant is in registration. Orthogonal to `status`, which is whether
 *  it may sign in today — a verified hospital can still be suspended. */
export type OnboardingStatus = 'pending' | 'documents_submitted' | 'verified' | 'rejected';

/** Minimal hospital info returned by GET /hospitals/public — no auth required. */
export interface HospitalPublicInfo {
  id: string;
  name: string;
  subdomain: string;
  category: string;
  tagline: string;
  theme: Record<string, string>;
  logoUrl: string;
}

export interface HospitalInfo {
  id: string;
  name: string;
  subdomain: string;
  category: string;
  tagline: string;
  currency: string;
  modules: Record<string, boolean>;
  theme: Record<string, string>;
  status: string;

  // Legal identity — printed on invoices and reports.
  legalName: string;
  entityType: string;
  ownership: string;
  registrationNo: string;
  registrationAuthority: string;
  registrationValidTill: string;
  pan: string;
  gstin: string;
  hfrId: string;
  nabhStatus: string;
  nabhValidTill: string;

  onboardingStatus: OnboardingStatus;
  verifiedAt: string;
  verifiedBy: string;
  goLiveDate: string;

  createdAt: string;
}

/** The registration detail behind a hospital. Every field optional on the way
 *  in: a tenant is routinely created for a trial before the paperwork lands. */
export interface HospitalProfileBody {
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  district?: string;
  state?: string;
  pincode?: string;
  country?: string;
  latitude?: number | null;
  longitude?: number | null;

  phonePrimary?: string;
  phoneSecondary?: string;
  phoneEmergency?: string;
  email?: string;
  website?: string;

  ownerName?: string;
  ownerPhone?: string;
  ownerEmail?: string;
  medicalDirectorName?: string;
  medicalDirectorRegNo?: string;
  medicalDirectorCouncil?: string;
  medicalDirectorQualification?: string;

  facilityType?: string;
  bedCount?: number;
  icuBeds?: number;
  nicuBeds?: number;
  emergencyBeds?: number;
  operationTheatres?: number;
  ambulanceCount?: number;
  hasPharmacy?: boolean;
  hasLab?: boolean;
  hasRadiology?: boolean;
  hasBloodBank?: boolean;
  hasEmergency?: boolean;
  hasAmbulance?: boolean;
  specialties?: string[];

  timezone?: string;
  locale?: string;
  financialYearStart?: string;
  opdHours?: Record<string, unknown>;
  weeklyOff?: string[];
  appointmentSlotMinutes?: number;
  lunchBreakStart?: string;
  lunchBreakEnd?: string;
  invoicePrefix?: string;
  invoiceSeriesStart?: number;
  mrnPrefix?: string;
  mrnFormat?: string;

  logoUrl?: string;
  letterheadUrl?: string;
  signatureUrl?: string;
  notes?: string;
}

export interface HospitalProfile extends HospitalProfileBody {
  id: string;
  hospitalId: string;
  updatedAt: string;
}

/** What a hospital admin may change about their own hospital.
 *
 *  Mirrors `schemas.HospitalSelfUpdate` on the server, which is the real
 *  allowlist — legal identity, subdomain, category, modules and the numbering
 *  prefixes are absent from both, so the screen cannot even offer them.
 */
export type HospitalSelfUpdateBody = Pick<
  HospitalProfileBody,
  | 'addressLine1' | 'addressLine2' | 'city' | 'district' | 'state' | 'pincode'
  | 'country' | 'latitude' | 'longitude'
  | 'phonePrimary' | 'phoneSecondary' | 'phoneEmergency' | 'email' | 'website'
  | 'ownerName' | 'ownerPhone' | 'ownerEmail'
  | 'medicalDirectorName' | 'medicalDirectorRegNo' | 'medicalDirectorCouncil'
  | 'medicalDirectorQualification'
  | 'facilityType' | 'bedCount' | 'icuBeds' | 'nicuBeds' | 'emergencyBeds'
  | 'operationTheatres' | 'ambulanceCount'
  | 'hasPharmacy' | 'hasLab' | 'hasRadiology' | 'hasBloodBank' | 'hasEmergency'
  | 'hasAmbulance' | 'specialties'
  | 'timezone' | 'locale' | 'opdHours' | 'weeklyOff' | 'appointmentSlotMinutes'
  | 'lunchBreakStart' | 'lunchBreakEnd'
  | 'logoUrl' | 'letterheadUrl' | 'signatureUrl' | 'notes'
> & {
  name?: string;
  tagline?: string;
  theme?: Record<string, string>;
};

/** What GET /hospitals/current returns — a tenant's public branding.
 *
 *  Deliberately narrower than HospitalInfo. That endpoint is unauthenticated,
 *  so it carries no legal identity; mirroring the server allowlist here means
 *  a component reading `hospital.gstin` fails to compile rather than reading
 *  undefined at runtime.
 */
export interface HospitalPublicConfig {
  id: string;
  name: string;
  subdomain: string;
  category: string;
  tagline: string;
  currency: string;
  modules: Record<string, boolean>;
  theme: Record<string, string>;
  /** Empty when the hospital has not uploaded one — screens fall back to the
   *  platform mark. */
  logoUrl: string;
  status: string;
}

/** Operational config needed by the booking UI. Public endpoint, no auth. */
export interface HospitalOperational {
  lunchBreakStart: string;
  lunchBreakEnd: string;
  appointmentSlotMinutes: number;
}

export type LicenceStatus = 'pending' | 'active' | 'expired' | 'rejected';

export interface HospitalLicenceBody {
  /** A code from the served catalog (GET /hospitals/meta/onboarding), not a
   *  closed union — the catalog is reference data the product extends. */
  type: string;
  number?: string;
  issuingAuthority?: string;
  issuedOn?: string;
  expiresOn?: string;
  status?: LicenceStatus;
  documentUrl?: string;
  notes?: string;
}

export interface HospitalLicence extends HospitalLicenceBody {
  id: string;
  hospitalId: string;
  createdAt: string;
  updatedAt: string;
}

export interface HospitalDocument {
  id: string;
  hospitalId: string;
  docType: string;
  licenceType: string;
  title: string;
  fileName: string;
  fileUrl: string;
  contentType: string;
  sizeBytes: number;
  uploadedBy: string;
  uploadedAt: string;
  notes: string;
}

export interface HospitalSubscriptionBody {
  plan?: string;
  status?: string;
  billingCycle?: string;
  price?: number;
  currency?: string;
  startedOn?: string;
  trialEndsOn?: string;
  renewsOn?: string;
  /** 0 means unmetered — an explicit sentinel, not "unknown". */
  maxUsers?: number;
  maxDoctors?: number;
  maxBeds?: number;
  billingContactName?: string;
  billingContactEmail?: string;
  billingContactPhone?: string;
  billingAddress?: string;
  billingGstin?: string;
  notes?: string;
}

export interface HospitalSubscription extends HospitalSubscriptionBody {
  id: string;
  hospitalId: string;
  createdAt: string;
  updatedAt: string;
}

/** Everything registered about one hospital — what POST /hospitals returns and
 *  what the settings screen reads in a single round trip. */
export interface HospitalDetail {
  hospital: HospitalInfo;
  profile: HospitalProfile | null;
  licences: HospitalLicence[];
  documents: HospitalDocument[];
  subscription: HospitalSubscription | null;
}

export interface HospitalCreateBody {
  name: string;
  subdomain: string;
  category: string;
  tagline?: string;
  currency?: string;
  theme?: { primary: string; primaryDark: string };
  modules?: Record<string, boolean>;

  legalName?: string;
  entityType?: string;
  ownership?: string;
  registrationNo?: string;
  registrationAuthority?: string;
  registrationValidTill?: string;
  pan?: string;
  gstin?: string;
  hfrId?: string;
  nabhStatus?: string;
  nabhValidTill?: string;
  /** Omit to seed from the category template. An explicit list replaces it
   *  outright, and must not be empty — the backend refuses a hospital with no
   *  departments, since every appointment is booked into one. */
  departments?: { name: string; description?: string }[];
  onboardingStatus?: OnboardingStatus;
  goLiveDate?: string;

  profile?: HospitalProfileBody;
  licences?: HospitalLicenceBody[];
  subscription?: HospitalSubscriptionBody;
  admin?: { email?: string; password?: string; name?: string; phone?: string };
}

export interface HospitalUpdateBody {
  name?: string;
  tagline?: string;
  currency?: string;
  category?: string;
  theme?: { primary: string; primaryDark: string };
  status?: string;

  legalName?: string;
  entityType?: string;
  ownership?: string;
  registrationNo?: string;
  registrationAuthority?: string;
  registrationValidTill?: string;
  pan?: string;
  gstin?: string;
  hfrId?: string;
  nabhStatus?: string;
  nabhValidTill?: string;
  onboardingStatus?: OnboardingStatus;
  goLiveDate?: string;
}

/** One entry of a served catalog. `code`/`label` is the shape every select in
 *  the wizard needs; licence types carry the extra fields below. */
export interface CatalogOption {
  code: string;
  label: string;
  description?: string;
  authority?: string;
  categories?: string[];
  module?: string | null;
  expires?: boolean;
  sortOrder?: number;
  tagline?: string;
}

/** The catalogs the onboarding wizard renders. Fetched rather than restated in
 *  TypeScript: which licences apply is already a rule on the backend (category
 *  + enabled modules), and a second copy of it here would drift. */
export interface OnboardingMeta {
  licenceTypes: CatalogOption[];
  documentTypes: CatalogOption[];
  entityTypes: CatalogOption[];
  ownershipTypes: CatalogOption[];
  facilityTypes: CatalogOption[];
  nabhStatuses: CatalogOption[];
  subscriptionPlans: CatalogOption[];
  states: string[];
  medicalCouncils: string[];
  categories: CatalogOption[];
  /** The chosen category's suggested departments, which the wizard pre-ticks.
   *  Served rather than restated in TS so the two sides cannot disagree about
   *  what a maternity hospital starts with. Empty when no category was passed. */
  suggestedDepartments: { name: string; description: string }[];
}

// ---------------------------------------------------------------------------
// Request body types
// ---------------------------------------------------------------------------
export interface LoginBody { email: string; password: string }
export interface RegisterBody {
  email: string;
  password: string;
  name: string;
  role: 'patient' | 'doctor' | 'nurse' | 'lab';
  phone?: string;
  dateOfBirth?: string;
  gender?: string;
  bloodGroup?: string;
  allergies?: string;
  chronicDiseases?: string;
  emergencyContact?: string;
  emergencyPhone?: string;
  insuranceProvider?: string;
  insuranceNumber?: string;
  /**
   * Purpose codes ticked on the notice. The backend refuses the sign-up unless
   * every required purpose is here — an account cannot exist before there is a
   * lawful basis for the data it will hold (DPDP 2023).
   */
  consents?: string[];
  /** Named when the person signing up is under 18 (DPDP s.9). */
  guardianName?: string;
  guardianRelationship?: string;
}
export interface ConsentCreateBody {
  purposeCode: string;
  subjectUserId?: string;
  guardianUserId?: string;
  guardianName?: string;
  guardianRelationship?: string;
  appointmentId?: string;
  method?: 'explicit' | 'implied_patient_initiated';
}
export interface AppointmentCreateBody {
  patientId: string;
  doctorId: string;
  departmentId: string;
  date: string;
  time: string;
  reason?: string;
  notes?: string;
  status?: 'scheduled' | 'completed' | 'cancelled';
  mode?: 'in-person' | 'video';
  followUpOf?: string;
}
export interface AppointmentUpdateBody {
  date?: string;
  time?: string;
  status?: 'scheduled' | 'completed' | 'cancelled';
  mode?: 'in-person' | 'video';
  reason?: string;
  notes?: string;
  // Reassignment; rejected for a caller scoped to their own appointments.
  doctorId?: string;
  departmentId?: string;
  // `rescheduled` is intentionally not here — the server raises it when the
  // date or time moves.
}
export interface PatientUpdateBody {
  dateOfBirth?: string;
  gender?: string;
  bloodGroup?: string;
  allergies?: string;
  chronicDiseases?: string;
  emergencyContact?: string;
  emergencyPhone?: string;
  medicalHistory?: string;
  insuranceProvider?: string;
  insuranceNumber?: string;
  documents?: string[];
}
export interface MedicalRecordCreateBody {
  patientId: string;
  appointmentId: string;
  doctorId: string;
  diagnosis?: string;
  prescription?: string;
  labReports?: string[];
}
export interface PrescriptionCreateBody {
  appointmentId: string;
  patientId: string;
  doctorId: string;
  medicineName?: string;
  dosage?: string;
  frequency?: string;
  duration?: string;
  instructions?: string;
}
export interface PaymentCreateBody {
  appointmentId: string;
  patientId: string;
  amount: number;
  paymentMethod?: string;
  status?: 'pending' | 'completed' | 'failed';
}
export interface PaymentInitiateBody {
  doctorId: string;
  patientId: string;
  departmentId: string;
  date: string;
  time: string;
  reason?: string;
  notes?: string;
  mode?: 'in-person' | 'video';
  followUpOf?: string;
}
export interface PaymentVerifyBody {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
  doctorId: string;
  patientId: string;
  departmentId: string;
  date: string;
  time: string;
  reason?: string;
  notes?: string;
  mode?: 'in-person' | 'video';
  followUpOf?: string;
}
export interface VitalsCreateBody {
  appointmentId: string;
  patientId: string;
  doctorId: string;
  temperature?: number;
  bloodPressure?: string;
  heartRate?: number;
  respiratoryRate?: number;
  weight?: number;
  height?: number;
  notes?: string;
}
export interface RazorpaySettingsUpdate {
  keyId: string;
  keySecret: string;
}
export interface RazorpaySettingsOut {
  keyId: string;
  hasSecret: boolean;
}
/** A permission the superadmin can hand to a role. Catalog is backend-owned. */
export interface PermissionInfo {
  code: string;
  label: string;
  description: string;
  resource: string;
  action: string;
  /** Hospital module this depends on; null when always available. */
  module: string | null;
  /** Whether this permission takes an 'own' / 'all' breadth. */
  supportsScope: boolean;
  sortOrder: number;
}

/** A permission granted to a role, at a breadth. */
export interface PermissionGrant {
  code: string;
  scope?: 'own' | 'all' | null;
}

// Role catalog (platform-wide, superadmin only)
export interface RoleInfo {
  code: string;
  label: string;
  description: string;
  isPlatform: boolean;
  sortOrder: number;
  /** Dashboard this role lands on after login ('' = no dedicated dashboard). */
  homePath: string;
  /** Everything this role may do — decided by the superadmin. */
  permissions: PermissionGrant[];
  userCount: number;
}
/** Slim projection any signed-in user may read — for role pickers. */
export interface RoleOption {
  code: string;
  label: string;
  homePath: string;
  /** Whether POST /auth/register accepts this role (a backend-owned boundary). */
  selfRegisterable: boolean;
}
export interface RoleCreateBody {
  code: string;
  label: string;
  description?: string;
  isPlatform?: boolean;
  sortOrder?: number;
  homePath?: string;
  /** Granted in the same request that creates the role. */
  permissions?: PermissionGrant[];
}
export interface RoleUpdateBody {
  label?: string;
  description?: string;
  isPlatform?: boolean;
  sortOrder?: number;
  homePath?: string;
  /** Replaces the role's grants wholesale; omit to leave them untouched. */
  permissions?: PermissionGrant[];
}

/** Staff account created through POST /users. */
export interface UserCreateBody {
  email: string;
  password: string;
  name: string;
  role: string;
  phone?: string;
  departmentId?: string;
  specialization?: string;
  qualification?: string;
  experienceYears?: number;
  consultationFee?: number;
  gender?: string;
  bloodGroup?: string;
  dateOfBirth?: string;
}
export interface UserUpdateBody {
  name?: string;
  email?: string;
  phone?: string;
  role?: string;
  password?: string;
}
/** Doctor profile edit — account fields plus professional details. */
export interface DoctorUpdateBody {
  name?: string;
  email?: string;
  phone?: string;
  departmentId?: string;
  qualification?: string;
  specialization?: string;
  experienceYears?: number;
  consultationFee?: number;
  licenseNumber?: string;
  medicalCouncil?: string;
  registrationYear?: string;
  verificationStatus?: string;
}

export interface DepartmentCreateBody { name: string; description?: string }
export interface DepartmentUpdateBody { name?: string; description?: string }

// ---------------------------------------------------------------------------
// Paged lists
// ---------------------------------------------------------------------------
/** One page of a list, plus how many rows match in total (ignoring the page). */
export interface Paged<T> {
  items: T[];
  total: number;
}

/** Query args every paged endpoint accepts. `q` searches server-side. */
export interface PageArgs {
  q?: string;
  limit?: number;
  offset?: number;
}

/** Counts across everything the caller can see — not just the current page. */
export interface AppointmentStats {
  total: number;
  scheduled: number;
  completed: number;
  cancelled: number;
  rescheduled: number;
}

/** The row count lives in a header, so the body stays a plain array. */
function pageOf<T>(items: T[], meta?: { response?: Response }): Paged<T> {
  const header = meta?.response?.headers.get('X-Total-Count');
  return { items, total: header === null || header === undefined ? items.length : Number(header) };
}

/** Drop empty params so they don't become `?q=&status=` on the wire. */
function cleanParams(params: object): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== '' && v !== null),
  );
}

// ---------------------------------------------------------------------------
// RTK Query API slice
// ---------------------------------------------------------------------------
export const api = createApi({
  reducerPath: 'api',

  // Renewal and tenant headers live in ./baseQuery — a 401 refreshes once and
  // replays, with concurrent refreshes serialised so token rotation is not
  // mistaken for theft.
  baseQuery: baseQueryWithReauth,

  tagTypes: [
    'Hospital',
    'Appointment',
    'Patient',
    'Doctor',
    'Department',
    'MedicalRecord',
    'Prescription',
    'Payment',
    'Vitals',
    'Role',
    'User',
    'Medicine',
    'MedicationOrder',
    'InventoryMovement',
    'LabTest',
    'TestOrder',
    'TestResult',
    'ScheduleBlock',
    'VideoSlot',
    'Pregnancy',
    'ANCVisit',
    'Baby',
    'Growth',
    'Immunization',
    'Consent',
    'Me',
  ],

  endpoints: (build) => ({
    // ── Superadmin (cross-tenant) ─────────────────────────────────────────────
    getSuperadminOverview: build.query<{
      hospitals: number; users: number; patients: number;
      doctors: number; appointments: number; departments: number;
    }, void>({
      query: () => '/superadmin/overview',
    }),
    getSuperadminPatients: build.query<Patient[], void>({ query: () => '/superadmin/patients' }),
    getSuperadminDoctors: build.query<Doctor[], void>({ query: () => '/superadmin/doctors' }),
    getSuperadminAppointments: build.query<Appointment[], void>({ query: () => '/superadmin/appointments' }),
    getSuperadminDepartments: build.query<Department[], void>({ query: () => '/superadmin/departments' }),
    getSuperadminUsers: build.query<User[], void>({ query: () => '/superadmin/users' }),

    // ── Roles (platform catalog, superadmin only) ────────────────────────────
    listRoles: build.query<RoleInfo[], void>({
      query: () => '/roles',
      providesTags: (result) =>
        result
          ? [
              ...result.map(({ code }) => ({ type: 'Role' as const, id: code })),
              { type: 'Role', id: 'LIST' },
            ]
          : [{ type: 'Role', id: 'LIST' }],
    }),
    // The grantable permission catalog, for the role permission matrix.
    listPermissions: build.query<PermissionInfo[], void>({
      query: () => '/permissions',
    }),
    // Assignable options for tenant-side role pickers (any signed-in user).
    listAssignableRoles: build.query<RoleOption[], void>({
      query: () => '/roles/assignable',
      providesTags: [{ type: 'Role', id: 'LIST' }],
    }),
    createRole: build.mutation<RoleInfo, RoleCreateBody>({
      query: (body) => ({ url: '/roles', method: 'POST', body }),
      invalidatesTags: [{ type: 'Role', id: 'LIST' }],
    }),
    updateRole: build.mutation<RoleInfo, { code: string; body: RoleUpdateBody }>({
      query: ({ code, body }) => ({ url: `/roles/${code}`, method: 'PUT', body }),
      invalidatesTags: [{ type: 'Role', id: 'LIST' }],
    }),
    deleteRole: build.mutation<void, string>({
      query: (code) => ({ url: `/roles/${code}`, method: 'DELETE' }),
      invalidatesTags: [{ type: 'Role', id: 'LIST' }],
    }),

    // ── Hospitals ────────────────────────────────────────────────────────────
    getCurrentHospital: build.query<HospitalPublicConfig, void>({
      query: () => '/hospitals/current',
      providesTags: ['Hospital'],
    }),
    getHospitalOperational: build.query<HospitalOperational, void>({
      query: () => '/hospitals/current/operational',
      providesTags: ['Hospital'],
    }),
    updateHospitalOperational: build.mutation<HospitalOperational, { lunchBreakStart: string; lunchBreakEnd: string }>({
      query: (body) => ({ url: '/hospitals/me/operational', method: 'PUT', body }),
      invalidatesTags: ['Hospital'],
    }),
    listPublicHospitals: build.query<HospitalPublicInfo[], void>({
      query: () => '/hospitals/public',
    }),
    listHospitals: build.query<HospitalInfo[], void>({
      query: () => '/hospitals',
      providesTags: ['Hospital'],
    }),
    /** The caller's OWN hospital, whole. No id in the URL — the tenant comes
     *  from the token, so there is nothing to point at someone else. */
    /** PUT, not POST: a hospital has one logo and a second upload replaces it. */
    uploadMyHospitalLogo: build.mutation<HospitalProfile, File>({
      query: (file) => {
        const form = new FormData();
        form.append('file', file);
        return { url: '/hospitals/me/logo', method: 'PUT', body: form };
      },
      invalidatesTags: ['Hospital'],
    }),
    removeMyHospitalLogo: build.mutation<HospitalProfile, void>({
      query: () => ({ url: '/hospitals/me/logo', method: 'DELETE' }),
      invalidatesTags: ['Hospital'],
    }),
    getMyHospitalSettings: build.query<HospitalDetail, void>({
      query: () => '/hospitals/me/settings',
      providesTags: ['Hospital'],
    }),
    updateMyHospitalSettings: build.mutation<HospitalDetail, HospitalSelfUpdateBody>({
      query: (body) => ({ url: '/hospitals/me/settings', method: 'PATCH', body }),
      invalidatesTags: ['Hospital'],
    }),
    getHospitalDetail: build.query<HospitalDetail, string>({
      query: (id) => `/hospitals/${id}/detail`,
      providesTags: ['Hospital'],
    }),
    /** The wizard's selects. Cached per category, since the licence list
     *  depends on it. */
    getOnboardingMeta: build.query<OnboardingMeta, string | void>({
      query: (category) =>
        category ? `/hospitals/meta/onboarding?category=${category}` : '/hospitals/meta/onboarding',
    }),
    onboardHospital: build.mutation<HospitalDetail, HospitalCreateBody>({
      query: (body) => ({ url: '/hospitals', method: 'POST', body }),
      invalidatesTags: ['Hospital'],
    }),
    updateHospital: build.mutation<HospitalInfo, { id: string; body: HospitalUpdateBody }>({
      query: ({ id, body }) => ({ url: `/hospitals/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['Hospital'],
    }),
    deleteHospital: build.mutation<void, string>({
      query: (id) => ({ url: `/hospitals/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Hospital'],
    }),
    /** PUT, not PATCH: the settings screen edits the whole profile as one form
     *  and submits all of it. */
    replaceHospitalProfile: build.mutation<
      HospitalProfile,
      { id: string; body: HospitalProfileBody }
    >({
      query: ({ id, body }) => ({ url: `/hospitals/${id}/profile`, method: 'PUT', body }),
      invalidatesTags: ['Hospital'],
    }),
    addHospitalLicence: build.mutation<
      HospitalLicence,
      { id: string; body: HospitalLicenceBody }
    >({
      query: ({ id, body }) => ({ url: `/hospitals/${id}/licences`, method: 'POST', body }),
      invalidatesTags: ['Hospital'],
    }),
    updateHospitalLicence: build.mutation<
      HospitalLicence,
      { id: string; licenceId: string; body: Partial<HospitalLicenceBody> }
    >({
      query: ({ id, licenceId, body }) => ({
        url: `/hospitals/${id}/licences/${licenceId}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['Hospital'],
    }),
    deleteHospitalLicence: build.mutation<void, { id: string; licenceId: string }>({
      query: ({ id, licenceId }) => ({
        url: `/hospitals/${id}/licences/${licenceId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Hospital'],
    }),
    /** Multipart — the one endpoint here that does not send JSON. Do not set
     *  Content-Type: the browser has to add the multipart boundary itself. */
    uploadHospitalDocument: build.mutation<
      HospitalDocument,
      {
        id: string;
        file: File;
        docType?: string;
        licenceType?: string;
        title?: string;
        notes?: string;
      }
    >({
      query: ({ id, file, docType, licenceType, title, notes }) => {
        const form = new FormData();
        form.append('file', file);
        if (docType) form.append('docType', docType);
        if (licenceType) form.append('licenceType', licenceType);
        if (title) form.append('title', title);
        if (notes) form.append('notes', notes);
        return { url: `/hospitals/${id}/documents`, method: 'POST', body: form };
      },
      invalidatesTags: ['Hospital'],
    }),
    deleteHospitalDocument: build.mutation<void, { id: string; documentId: string }>({
      query: ({ id, documentId }) => ({
        url: `/hospitals/${id}/documents/${documentId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Hospital'],
    }),
    replaceHospitalSubscription: build.mutation<
      HospitalSubscription,
      { id: string; body: HospitalSubscriptionBody }
    >({
      query: ({ id, body }) => ({
        url: `/hospitals/${id}/subscription`,
        method: 'PUT',
        body,
      }),
      invalidatesTags: ['Hospital'],
    }),

    // ── Auth ─────────────────────────────────────────────────────────────────
    login: build.mutation<ApiAuthResponse, LoginBody>({
      query: (body) => ({ url: '/auth/login', method: 'POST', body }),
    }),
    register: build.mutation<ApiAuthResponse, RegisterBody & { hospitalId?: string }>({
      query: ({ hospitalId, ...body }) => ({
        url: '/auth/register',
        method: 'POST',
        body,
        headers: hospitalId ? { 'X-Hospital-Id': hospitalId } : undefined,
      }),
    }),
    me: build.query<ApiAuthResponse, void>({
      query: () => '/auth/me',
      providesTags: ['Me'],
    }),
    // Ends this session server-side. Clearing localStorage alone would leave a
    // live session behind on a shared machine — the token would keep working
    // for anyone who recovered it.
    logout: build.mutation<void, void>({
      query: () => ({ url: '/auth/logout', method: 'POST' }),
      invalidatesTags: ['Me'],
    }),
    // "Sign out everywhere" — the stolen-laptop button.
    logoutAll: build.mutation<void, void>({
      query: () => ({ url: '/auth/logout-all', method: 'POST' }),
      invalidatesTags: ['Me'],
    }),
    // Sends a reset link to the address if it is registered. Always 200.
    forgotPassword: build.mutation<{ message: string }, { email: string }>({
      query: (body) => ({ url: '/auth/forgot-password', method: 'POST', body }),
    }),
    // Consumes the one-time token and sets a new password.
    resetPassword: build.mutation<{ message: string }, { token: string; newPassword: string }>({
      query: ({ token, newPassword }) => ({
        url: '/auth/reset-password',
        method: 'POST',
        body: { token, newPassword },
      }),
    }),

    // ── FCM / Push notifications ──────────────────────────────────────────────
    registerFcmToken: build.mutation<void, { token: string; device_label: string }>({
      query: (body) => ({ url: '/notifications/token', method: 'POST', body }),
    }),
    unregisterFcmToken: build.mutation<void, { token: string; device_label: string }>({
      query: (body) => ({ url: '/notifications/token', method: 'DELETE', body }),
    }),

    // ── Consent ──────────────────────────────────────────────────────────────
    // The notice. Unauthenticated on purpose: the sign-up form has to show it
    // before it collects anything, and it has no token at that point.
    listConsentPurposes: build.query<ConsentPurpose[], void>({
      query: () => '/consent-purposes',
    }),
    listConsents: build.query<Consent[], { subjectUserId?: string; includeWithdrawn?: boolean } | void>({
      query: (params) => ({ url: '/consents', params: params ?? undefined }),
      providesTags: ['Consent'],
    }),
    createConsent: build.mutation<Consent, ConsentCreateBody>({
      query: (body) => ({ url: '/consents', method: 'POST', body }),
      invalidatesTags: ['Consent'],
    }),
    withdrawConsent: build.mutation<void, { purposeCode: string; subjectUserId?: string }>({
      query: ({ purposeCode, subjectUserId }) => ({
        url: `/consents/${purposeCode}/withdraw`,
        method: 'POST',
        params: subjectUserId ? { subjectUserId } : undefined,
      }),
      invalidatesTags: ['Consent'],
    }),

    // ── Appointments ─────────────────────────────────────────────────────────
    listAppointments: build.query<
      Appointment[],
      { patientId?: string; doctorId?: string } | void
    >({
      query: (params) => ({
        url: '/appointments',
        params: params ?? undefined,
      }),
      providesTags: (result) =>
        result
          ? [
              ...result.map(({ id }) => ({ type: 'Appointment' as const, id })),
              { type: 'Appointment', id: 'LIST' },
            ]
          : [{ type: 'Appointment', id: 'LIST' }],
    }),
    getAppointment: build.query<Appointment, string>({
      query: (id) => `/appointments/${id}`,
      providesTags: (_r, _e, id) => [{ type: 'Appointment', id }],
    }),
    createAppointment: build.mutation<Appointment, AppointmentCreateBody & { hospitalId?: string }>({
      query: ({ hospitalId, ...body }) => ({
        url: '/appointments',
        method: 'POST',
        body,
        headers: hospitalId ? { 'X-Hospital-Id': hospitalId } : undefined,
      }),
      invalidatesTags: [{ type: 'Appointment', id: 'LIST' }],
    }),
    updateAppointment: build.mutation<
      Appointment,
      { id: string; body: AppointmentUpdateBody; hospitalId?: string }
    >({
      query: ({ id, body, hospitalId }) => ({
        url: `/appointments/${id}`,
        method: 'PUT',
        body,
        headers: hospitalId ? { 'X-Hospital-Id': hospitalId } : undefined,
      }),
      invalidatesTags: (_r, _e, { id }) => [{ type: 'Appointment', id }],
    }),

    // ── Patients ──────────────────────────────────────────────────────────────
    listPatients: build.query<Patient[], void>({
      query: () => '/patients',
      providesTags: (result) =>
        result
          ? [
              ...result.map(({ id }) => ({ type: 'Patient' as const, id })),
              { type: 'Patient', id: 'LIST' },
            ]
          : [{ type: 'Patient', id: 'LIST' }],
    }),

    // ── Paged list variants ───────────────────────────────────────────────────
    // A screen showing a long table asks for one page and searches server-side;
    // the unpaged hooks above stay for the screens that use these lists as
    // lookup tables (resolving an id to a name), where a partial list would drop
    // names from the UI rather than page them.
    listPatientsPaged: build.query<Paged<Patient>, PageArgs & { withStats?: boolean }>({
      query: (params) => ({ url: '/patients', params: cleanParams(params) }),
      transformResponse: pageOf<Patient>,
      providesTags: [{ type: 'Patient', id: 'LIST' }],
    }),
    listAppointmentsPaged: build.query<
      Paged<Appointment>,
      PageArgs & { status?: string; departmentId?: string; date?: string }
    >({
      query: (params) => ({ url: '/appointments', params: cleanParams(params) }),
      transformResponse: pageOf<Appointment>,
      providesTags: [{ type: 'Appointment', id: 'LIST' }],
    }),
    listTestOrdersPaged: build.query<
      Paged<TestOrder>,
      PageArgs & { status?: string; patientId?: string; doctorId?: string }
    >({
      query: (params) => ({ url: '/test-orders', params: cleanParams(params) }),
      transformResponse: pageOf<TestOrder>,
      providesTags: [{ type: 'TestOrder', id: 'LIST' }],
    }),
    listDoctorsPaged: build.query<
      Paged<Doctor>,
      PageArgs & { departmentId?: string; specialization?: string; verificationStatus?: string }
    >({
      query: (params) => ({ url: '/doctors', params: cleanParams(params) }),
      transformResponse: pageOf<Doctor>,
      providesTags: [{ type: 'Doctor', id: 'LIST' }],
    }),
    listUsersPaged: build.query<Paged<User>, PageArgs & { role?: string }>({
      query: (params) => ({ url: '/users', params: cleanParams(params) }),
      transformResponse: pageOf<User>,
      providesTags: [{ type: 'User', id: 'LIST' }],
    }),
    listDepartmentsPaged: build.query<Paged<Department>, PageArgs>({
      query: (params) => ({ url: '/departments', params: cleanParams(params) }),
      transformResponse: pageOf<Department>,
      providesTags: [{ type: 'Department', id: 'LIST' }],
    }),
    listMedicinesPaged: build.query<Paged<Medicine>, PageArgs & { category?: string }>({
      query: (params) => ({ url: '/medicines', params: cleanParams(params) }),
      transformResponse: pageOf<Medicine>,
      providesTags: [{ type: 'Medicine', id: 'LIST' }],
    }),
    listLabTestsPaged: build.query<Paged<LabTest>, PageArgs & { category?: string }>({
      query: (params) => ({ url: '/lab-tests', params: cleanParams(params) }),
      transformResponse: pageOf<LabTest>,
      providesTags: [{ type: 'LabTest', id: 'LIST' }],
    }),
    listPrescriptionsPaged: build.query<
      Paged<Prescription>,
      PageArgs & { patientId?: string; doctorId?: string; appointmentId?: string }
    >({
      query: (params) => ({ url: '/prescriptions', params: cleanParams(params) }),
      transformResponse: pageOf<Prescription>,
      providesTags: [{ type: 'Prescription', id: 'LIST' }],
    }),
    listVitalsPaged: build.query<
      Paged<Vitals>,
      PageArgs & { patientId?: string; appointmentId?: string }
    >({
      query: (params) => ({ url: '/vitals', params: cleanParams(params) }),
      transformResponse: pageOf<Vitals>,
      providesTags: [{ type: 'Vitals', id: 'LIST' }],
    }),
    listPregnanciesPaged: build.query<
      Paged<PregnancyRecord>,
      PageArgs & { patientId?: string; status?: string }
    >({
      query: (params) => ({ url: '/pregnancies', params: cleanParams(params) }),
      transformResponse: pageOf<PregnancyRecord>,
      providesTags: [{ type: 'Pregnancy', id: 'LIST' }],
    }),
    listBabiesPaged: build.query<Paged<Baby>, PageArgs & { motherPatientId?: string }>({
      query: (params) => ({ url: '/babies', params: cleanParams(params) }),
      transformResponse: pageOf<Baby>,
      providesTags: [{ type: 'Baby', id: 'LIST' }],
    }),
    listPaymentsPaged: build.query<
      Paged<Payment>,
      PageArgs & { patientId?: string; appointmentId?: string; status?: string }
    >({
      query: (params) => ({ url: '/payments', params: cleanParams(params) }),
      transformResponse: pageOf<Payment>,
      providesTags: [{ type: 'Payment', id: 'LIST' }],
    }),

    // ── Paged superadmin (cross-tenant) lists ─────────────────────────────────
    // Same three params plus `hospitalId`, so the platform screens filter by
    // hospital on the server instead of downloading every tenant to filter here.
    getSuperadminPatientsPaged: build.query<
      Paged<Patient>,
      PageArgs & { hospitalId?: string; withStats?: boolean }
    >({
      query: (params) => ({ url: '/superadmin/patients', params: cleanParams(params) }),
      transformResponse: pageOf<Patient>,
      providesTags: [{ type: 'Patient', id: 'LIST' }],
    }),
    getSuperadminDoctorsPaged: build.query<Paged<Doctor>, PageArgs & { hospitalId?: string }>({
      query: (params) => ({ url: '/superadmin/doctors', params: cleanParams(params) }),
      transformResponse: pageOf<Doctor>,
      providesTags: [{ type: 'Doctor', id: 'LIST' }],
    }),
    getSuperadminAppointmentsPaged: build.query<
      Paged<Appointment>,
      PageArgs & { hospitalId?: string; status?: string }
    >({
      query: (params) => ({ url: '/superadmin/appointments', params: cleanParams(params) }),
      transformResponse: pageOf<Appointment>,
      providesTags: [{ type: 'Appointment', id: 'LIST' }],
    }),
    getSuperadminDepartmentsPaged: build.query<
      Paged<Department>,
      PageArgs & { hospitalId?: string }
    >({
      query: (params) => ({ url: '/superadmin/departments', params: cleanParams(params) }),
      transformResponse: pageOf<Department>,
      providesTags: [{ type: 'Department', id: 'LIST' }],
    }),
    getSuperadminUsersPaged: build.query<
      Paged<User>,
      PageArgs & { hospitalId?: string; role?: string }
    >({
      query: (params) => ({ url: '/superadmin/users', params: cleanParams(params) }),
      transformResponse: pageOf<User>,
      providesTags: [{ type: 'User', id: 'LIST' }],
    }),
    getAppointmentStats: build.query<AppointmentStats, void>({
      query: () => '/appointments/stats',
      providesTags: [{ type: 'Appointment', id: 'LIST' }],
    }),
    getPatient: build.query<Patient, string>({
      query: (id) => `/patients/${id}`,
      providesTags: (_r, _e, id) => [{ type: 'Patient', id }],
    }),
    getPatientByUser: build.query<Patient, string>({
      query: (userId) => `/patients/by-user/${userId}`,
      providesTags: (result) =>
        result ? [{ type: 'Patient', id: result.id }] : [],
    }),
    updatePatient: build.mutation<Patient, { id: string; body: PatientUpdateBody; hospitalId?: string }>({
      query: ({ id, body, hospitalId }) => ({
        url: `/patients/${id}`,
        method: 'PUT',
        body,
        headers: hospitalId ? { 'X-Hospital-Id': hospitalId } : undefined,
      }),
      invalidatesTags: (_r, _e, { id }) => [{ type: 'Patient', id }],
    }),
    deletePatient: build.mutation<void, { id: string; hospitalId?: string }>({
      query: ({ id, hospitalId }) => ({
        url: `/patients/${id}`,
        method: 'DELETE',
        headers: hospitalId ? { 'X-Hospital-Id': hospitalId } : undefined,
      }),
      invalidatesTags: [{ type: 'Patient', id: 'LIST' }],
    }),
    getPatientAppointments: build.query<Appointment[], string>({
      query: (patientId) => `/patients/${patientId}/appointments`,
      providesTags: [{ type: 'Appointment', id: 'LIST' }],
    }),
    getPatientMedicalRecords: build.query<MedicalRecord[], string>({
      query: (patientId) => `/patients/${patientId}/medical-records`,
      providesTags: [{ type: 'MedicalRecord', id: 'LIST' }],
    }),
    getPatientPayments: build.query<Payment[], string>({
      query: (patientId) => `/patients/${patientId}/payments`,
      providesTags: [{ type: 'Payment', id: 'LIST' }],
    }),
    getPatientPrescriptions: build.query<Prescription[], string>({
      query: (patientId) => `/patients/${patientId}/prescriptions`,
      providesTags: [{ type: 'Prescription', id: 'LIST' }],
    }),
    getPatientVitals: build.query<Vitals[], string>({
      query: (patientId) => `/patients/${patientId}/vitals`,
      providesTags: [{ type: 'Vitals', id: 'LIST' }],
    }),

    // ── Doctors ───────────────────────────────────────────────────────────────
    listDoctors: build.query<Doctor[], void>({
      query: () => '/doctors',
      providesTags: (result) =>
        result
          ? [
              ...result.map(({ id }) => ({ type: 'Doctor' as const, id })),
              { type: 'Doctor', id: 'LIST' },
            ]
          : [{ type: 'Doctor', id: 'LIST' }],
    }),
    getDoctor: build.query<Doctor, string>({
      query: (id) => `/doctors/${id}`,
      providesTags: (_r, _e, id) => [{ type: 'Doctor', id }],
    }),
    getDoctorByUser: build.query<Doctor, string>({
      query: (userId) => `/doctors/by-user/${userId}`,
      providesTags: (result) =>
        result ? [{ type: 'Doctor', id: result.id }] : [],
    }),
    // Slot availability without the underlying appointments — safe for a
    // patient, who may not read other people's bookings.
    getDoctorAvailability: build.query<
      { doctorId: string; date: string; taken: string[]; blocks: ScheduleBlock[] },
      // hospitalId names the tenant the doctor belongs to — needed when a
      // superadmin, who has no hospital of their own, reschedules for one.
      { doctorId: string; date: string; hospitalId?: string }
    >({
      query: ({ doctorId, date, hospitalId }) => ({
        url: `/doctors/${doctorId}/availability`,
        params: { date },
        headers: hospitalId ? { 'X-Hospital-Id': hospitalId } : undefined,
      }),
      providesTags: [{ type: 'Appointment', id: 'LIST' }, { type: 'ScheduleBlock', id: 'LIST' }],
    }),
    getDoctorAppointments: build.query<Appointment[], string>({
      query: (doctorId) => `/doctors/${doctorId}/appointments`,
      providesTags: [{ type: 'Appointment', id: 'LIST' }],
    }),

    // ── Departments ───────────────────────────────────────────────────────────
    listDepartments: build.query<Department[], void>({
      query: () => '/departments',
      providesTags: (result) =>
        result
          ? [
              ...result.map(({ id }) => ({ type: 'Department' as const, id })),
              { type: 'Department', id: 'LIST' },
            ]
          : [{ type: 'Department', id: 'LIST' }],
    }),
    createDepartment: build.mutation<Department, DepartmentCreateBody>({
      query: (body) => ({ url: '/departments', method: 'POST', body }),
      invalidatesTags: [{ type: 'Department', id: 'LIST' }],
    }),
    updateDepartment: build.mutation<
      Department,
      { id: string; body: DepartmentUpdateBody; hospitalId?: string }
    >({
      query: ({ id, body, hospitalId }) => ({
        url: `/departments/${id}`,
        method: 'PUT',
        body,
        headers: hospitalId ? { 'X-Hospital-Id': hospitalId } : undefined,
      }),
      invalidatesTags: (_r, _e, { id }) => [{ type: 'Department', id }],
    }),
    deleteDepartment: build.mutation<void, { id: string; hospitalId?: string }>({
      query: ({ id, hospitalId }) => ({
        url: `/departments/${id}`,
        method: 'DELETE',
        headers: hospitalId ? { 'X-Hospital-Id': hospitalId } : undefined,
      }),
      invalidatesTags: [{ type: 'Department', id: 'LIST' }],
    }),

    // ── Medical Records ───────────────────────────────────────────────────────
    listMedicalRecords: build.query<
      MedicalRecord[],
      { patientId?: string; appointmentId?: string } | void
    >({
      query: (params) => ({ url: '/medical-records', params: params ?? undefined }),
      providesTags: [{ type: 'MedicalRecord', id: 'LIST' }],
    }),
    createMedicalRecord: build.mutation<MedicalRecord, MedicalRecordCreateBody>({
      query: (body) => ({ url: '/medical-records', method: 'POST', body }),
      invalidatesTags: [{ type: 'MedicalRecord', id: 'LIST' }],
    }),

    // ── Prescriptions ─────────────────────────────────────────────────────────
    listPrescriptions: build.query<
      Prescription[],
      { patientId?: string; appointmentId?: string } | void
    >({
      query: (params) => ({ url: '/prescriptions', params: params ?? undefined }),
      providesTags: [{ type: 'Prescription', id: 'LIST' }],
    }),
    createPrescription: build.mutation<Prescription, PrescriptionCreateBody>({
      query: (body) => ({ url: '/prescriptions', method: 'POST', body }),
      invalidatesTags: [{ type: 'Prescription', id: 'LIST' }],
    }),
    updatePrescription: build.mutation<Prescription, { id: string; body: Partial<PrescriptionCreateBody> }>({
      query: ({ id, body }) => ({ url: `/prescriptions/${id}`, method: 'PUT', body }),
      invalidatesTags: [{ type: 'Prescription', id: 'LIST' }],
    }),
    deletePrescription: build.mutation<void, string>({
      query: (id) => ({ url: `/prescriptions/${id}`, method: 'DELETE' }),
      invalidatesTags: [{ type: 'Prescription', id: 'LIST' }],
    }),

    // ── Payments ──────────────────────────────────────────────────────────────
    listPayments: build.query<
      Payment[],
      { patientId?: string; appointmentId?: string } | void
    >({
      query: (params) => ({ url: '/payments', params: params ?? undefined }),
      providesTags: [{ type: 'Payment', id: 'LIST' }],
    }),
    createPayment: build.mutation<Payment, PaymentCreateBody>({
      query: (body) => ({ url: '/payments', method: 'POST', body }),
      invalidatesTags: [{ type: 'Payment', id: 'LIST' }],
    }),
    // Step 1 of online booking: creates a Razorpay order server-side and
    // returns the order_id + key_id needed to open the checkout dialog.
    // The appointment is NOT created here — only on a successful verify.
    initiatePayment: build.mutation<PaymentInitiateOut, PaymentInitiateBody>({
      query: (body) => ({ url: '/payments/initiate', method: 'POST', body }),
    }),
    // Step 2 of online booking: verifies the Razorpay HMAC signature and
    // atomically creates the appointment + payment record.
    verifyPayment: build.mutation<PaymentVerifyOut, PaymentVerifyBody>({
      query: (body) => ({ url: '/payments/verify', method: 'POST', body }),
      invalidatesTags: [
        { type: 'Appointment', id: 'LIST' },
        { type: 'Payment', id: 'LIST' },
      ],
    }),

    // ── Razorpay settings (per-hospital gateway config) ─────────────────────
    getRazorpaySettings: build.query<RazorpaySettingsOut, void>({
      query: () => '/hospitals/me/razorpay',
      providesTags: [{ type: 'Hospital', id: 'RAZORPAY' }],
    }),
    updateRazorpaySettings: build.mutation<RazorpaySettingsOut, RazorpaySettingsUpdate>({
      query: (body) => ({ url: '/hospitals/me/razorpay', method: 'PUT', body }),
      invalidatesTags: [{ type: 'Hospital', id: 'RAZORPAY' }],
    }),

    // ── Users (staff provisioning; guarded by users.manage) ──────────────────
    listUsers: build.query<User[], void>({
      query: () => '/users',
      providesTags: [{ type: 'User', id: 'LIST' }],
    }),
    createUser: build.mutation<User, UserCreateBody>({
      query: (body) => ({ url: '/users', method: 'POST', body }),
      invalidatesTags: [{ type: 'User', id: 'LIST' }],
    }),
    // Self-service: name/email/phone only, no role or password.
    updateOwnAccount: build.mutation<User, { name?: string; email?: string; phone?: string }>({
      query: (body) => ({ url: '/users/me', method: 'PUT', body }),
      invalidatesTags: [{ type: 'User', id: 'LIST' }],
    }),
    updateUser: build.mutation<User, { id: string; body: UserUpdateBody; hospitalId?: string }>({
      query: ({ id, body, hospitalId }) => ({
        url: `/users/${id}`,
        method: 'PUT',
        body,
        headers: hospitalId ? { 'X-Hospital-Id': hospitalId } : undefined,
      }),
      invalidatesTags: [{ type: 'User', id: 'LIST' }],
    }),
    deleteUser: build.mutation<void, { id: string; hospitalId?: string }>({
      query: ({ id, hospitalId }) => ({
        url: `/users/${id}`,
        method: 'DELETE',
        headers: hospitalId ? { 'X-Hospital-Id': hospitalId } : undefined,
      }),
      invalidatesTags: [{ type: 'User', id: 'LIST' }],
    }),

    // ── Doctors (write side) ─────────────────────────────────────────────────
    updateDoctor: build.mutation<Doctor, { id: string; body: DoctorUpdateBody; hospitalId?: string }>({
      query: ({ id, body, hospitalId }) => ({
        url: `/doctors/${id}`,
        method: 'PUT',
        body,
        headers: hospitalId ? { 'X-Hospital-Id': hospitalId } : undefined,
      }),
      invalidatesTags: [{ type: 'Doctor', id: 'LIST' }],
    }),
    deleteDoctor: build.mutation<void, { id: string; hospitalId?: string }>({
      query: ({ id, hospitalId }) => ({
        url: `/doctors/${id}`,
        method: 'DELETE',
        headers: hospitalId ? { 'X-Hospital-Id': hospitalId } : undefined,
      }),
      invalidatesTags: [{ type: 'Doctor', id: 'LIST' }],
    }),

    // ── Appointments (delete) ────────────────────────────────────────────────
    deleteAppointment: build.mutation<void, { id: string; hospitalId?: string }>({
      query: ({ id, hospitalId }) => ({
        url: `/appointments/${id}`,
        method: 'DELETE',
        headers: hospitalId ? { 'X-Hospital-Id': hospitalId } : undefined,
      }),
      invalidatesTags: [{ type: 'Appointment', id: 'LIST' }],
    }),

    // ── Medicines ────────────────────────────────────────────────────────────
    listMedicines: build.query<Medicine[], void>({
      query: () => '/medicines',
      providesTags: [{ type: 'Medicine', id: 'LIST' }],
    }),
    createMedicine: build.mutation<Medicine, Partial<Medicine>>({
      query: (body) => ({ url: '/medicines', method: 'POST', body }),
      invalidatesTags: [{ type: 'Medicine', id: 'LIST' }],
    }),
    updateMedicine: build.mutation<Medicine, { id: string; body: Partial<Medicine> }>({
      query: ({ id, body }) => ({ url: `/medicines/${id}`, method: 'PUT', body }),
      invalidatesTags: [{ type: 'Medicine', id: 'LIST' }],
    }),
    deleteMedicine: build.mutation<void, string>({
      query: (id) => ({ url: `/medicines/${id}`, method: 'DELETE' }),
      invalidatesTags: [{ type: 'Medicine', id: 'LIST' }],
    }),

    // ── Medication Orders ─────────────────────────────────────────────────────
    listMedicationOrders: build.query<
      MedicationOrder[],
      { patientId?: string; doctorId?: string; appointmentId?: string; status?: string; q?: string } | void
    >({
      query: (params) => ({ url: '/medication-orders', params: params ?? undefined }),
      providesTags: [{ type: 'MedicationOrder', id: 'LIST' }],
    }),
    createMedicationOrder: build.mutation<MedicationOrder, {
      appointmentId?: string;
      patientId: string;
      /** Omit when the caller is the prescribing doctor — the server writes
       *  their own id. A pharmacist recording someone else's prescription
       *  must name them. */
      doctorId?: string;
      prescriptionId?: string;
      medicineId?: string;
      medicineName: string;
      quantity: number;
      dosage: string;
      route: string;
      frequency?: string;
      duration?: string;
      instructions?: string;
    }>({
      query: (body) => ({ url: '/medication-orders', method: 'POST', body }),
      invalidatesTags: [{ type: 'MedicationOrder', id: 'LIST' }],
    }),
    dispenseMedicationOrder: build.mutation<MedicationOrder, string>({
      query: (id) => ({ url: `/medication-orders/${id}/dispense`, method: 'PATCH' }),
      invalidatesTags: [{ type: 'MedicationOrder', id: 'LIST' }, { type: 'Medicine', id: 'LIST' }],
    }),
    administerMedicationOrder: build.mutation<MedicationOrder, { id: string; notes?: string; site?: string }>({
      query: ({ id, notes, site }) => ({ url: `/medication-orders/${id}/administer`, method: 'PATCH', body: { notes, site } }),
      invalidatesTags: [{ type: 'MedicationOrder', id: 'LIST' }],
    }),
    cancelMedicationOrder: build.mutation<MedicationOrder, string>({
      query: (id) => ({ url: `/medication-orders/${id}/cancel`, method: 'PATCH' }),
      invalidatesTags: [{ type: 'MedicationOrder', id: 'LIST' }],
    }),
    billMedicationOrder: build.mutation<PharmacyBillOut, { id: string; paymentMethod: string }>({
      query: ({ id, paymentMethod }) => ({
        url: `/medication-orders/${id}/bill`,
        method: 'POST',
        body: { paymentMethod },
      }),
      invalidatesTags: [{ type: 'MedicationOrder', id: 'LIST' }],
    }),

    // ── Inventory ─────────────────────────────────────────────────────────────
    listInventoryMovements: build.query<
      InventoryMovement[],
      { medicineId?: string; type?: string } | void
    >({
      query: (params) => ({ url: '/inventory/movements', params: params ?? undefined }),
      providesTags: [{ type: 'InventoryMovement', id: 'LIST' }],
    }),
    listLowStock: build.query<Medicine[], void>({
      query: () => '/inventory/low-stock',
      providesTags: [{ type: 'Medicine', id: 'LIST' }],
    }),
    restockMedicine: build.mutation<InventoryMovement, {
      medicineId: string;
      quantity: number;
      lotNumber?: string;
      expiryDate?: string;
      notes?: string;
    }>({
      query: (body) => ({ url: '/inventory/restock', method: 'POST', body }),
      invalidatesTags: [{ type: 'Medicine', id: 'LIST' }, { type: 'InventoryMovement', id: 'LIST' }],
    }),
    adjustInventory: build.mutation<InventoryMovement, {
      medicineId: string;
      quantity: number;
      movementType: string;
      notes?: string;
    }>({
      query: (body) => ({ url: '/inventory/adjust', method: 'POST', body }),
      invalidatesTags: [{ type: 'Medicine', id: 'LIST' }, { type: 'InventoryMovement', id: 'LIST' }],
    }),

    // ── Lab test catalog ─────────────────────────────────────────────────────
    listLabTests: build.query<LabTest[], void>({
      query: () => '/lab-tests',
      providesTags: [{ type: 'LabTest', id: 'LIST' }],
    }),
    createLabTest: build.mutation<LabTest, Partial<LabTest>>({
      query: (body) => ({ url: '/lab-tests', method: 'POST', body }),
      invalidatesTags: [{ type: 'LabTest', id: 'LIST' }],
    }),
    updateLabTest: build.mutation<LabTest, { id: string; body: Partial<LabTest> }>({
      query: ({ id, body }) => ({ url: `/lab-tests/${id}`, method: 'PUT', body }),
      invalidatesTags: [{ type: 'LabTest', id: 'LIST' }],
    }),
    deleteLabTest: build.mutation<void, string>({
      query: (id) => ({ url: `/lab-tests/${id}`, method: 'DELETE' }),
      invalidatesTags: [{ type: 'LabTest', id: 'LIST' }],
    }),

    // ── Lab orders and results ───────────────────────────────────────────────
    listTestOrders: build.query<TestOrder[], { patientId?: string; doctorId?: string; appointmentId?: string } | void>({
      query: (params) => ({ url: '/test-orders', params: params ?? undefined }),
      providesTags: [{ type: 'TestOrder', id: 'LIST' }],
    }),
    getTestOrder: build.query<TestOrder, string>({
      query: (id) => `/test-orders/${id}`,
      providesTags: (_r, _e, id) => [{ type: 'TestOrder', id }],
    }),
    createTestOrder: build.mutation<TestOrder, Partial<TestOrder>>({
      query: (body) => ({ url: '/test-orders', method: 'POST', body }),
      invalidatesTags: [{ type: 'TestOrder', id: 'LIST' }],
    }),
    updateTestOrder: build.mutation<TestOrder, { id: string; body: Partial<TestOrder> }>({
      query: ({ id, body }) => ({ url: `/test-orders/${id}`, method: 'PUT', body }),
      invalidatesTags: [{ type: 'TestOrder', id: 'LIST' }],
    }),
    // The ordering clinician's sign-off — a narrower act than the lab's own
    // processing, and a different permission.
    reviewTestOrder: build.mutation<TestOrder, string>({
      query: (id) => ({ url: `/test-orders/${id}/review`, method: 'PUT' }),
      invalidatesTags: [{ type: 'TestOrder', id: 'LIST' }],
    }),
    deleteTestOrder: build.mutation<void, string>({
      query: (id) => ({ url: `/test-orders/${id}`, method: 'DELETE' }),
      invalidatesTags: [{ type: 'TestOrder', id: 'LIST' }],
    }),
    cancelTestOrder: build.mutation<void, string>({
      query: (id) => ({ url: `/test-orders/${id}/cancel`, method: 'POST' }),
      invalidatesTags: [{ type: 'TestOrder', id: 'LIST' }],
    }),
    listTestResults: build.query<TestResult[], { orderId?: string } | void>({
      query: (params) => ({ url: '/test-results', params: params ?? undefined }),
      providesTags: [{ type: 'TestResult', id: 'LIST' }],
    }),
    upsertTestResult: build.mutation<TestResult, Partial<TestResult>>({
      query: (body) => ({ url: '/test-results', method: 'POST', body }),
      invalidatesTags: [{ type: 'TestResult', id: 'LIST' }, { type: 'TestOrder', id: 'LIST' }],
    }),

    // ── Schedule blocks ──────────────────────────────────────────────────────
    listScheduleBlocks: build.query<ScheduleBlock[], { doctorId?: string } | void>({
      query: (params) => ({ url: '/schedule-blocks', params: params ?? undefined }),
      providesTags: [{ type: 'ScheduleBlock', id: 'LIST' }],
    }),
    createScheduleBlock: build.mutation<ScheduleBlock, Partial<ScheduleBlock>>({
      query: (body) => ({ url: '/schedule-blocks', method: 'POST', body }),
      invalidatesTags: [{ type: 'ScheduleBlock', id: 'LIST' }],
    }),
    deleteScheduleBlock: build.mutation<void, string>({
      query: (id) => ({ url: `/schedule-blocks/${id}`, method: 'DELETE' }),
      invalidatesTags: [{ type: 'ScheduleBlock', id: 'LIST' }],
    }),

    // ── Video slots ──────────────────────────────────────────────────────────
    listVideoSlots: build.query<VideoSlot[], { doctorId?: string; status?: string } | void>({
      query: (params) => ({ url: '/video-slots', params: params ?? undefined }),
      providesTags: [{ type: 'VideoSlot', id: 'LIST' }],
    }),
    createVideoSlot: build.mutation<VideoSlot, Partial<VideoSlot>>({
      query: (body) => ({ url: '/video-slots', method: 'POST', body }),
      invalidatesTags: [{ type: 'VideoSlot', id: 'LIST' }],
    }),
    bookVideoSlot: build.mutation<VideoSlot, { id: string; body: { appointmentId: string } }>({
      query: ({ id, body }) => ({ url: `/video-slots/${id}/book`, method: 'POST', body }),
      // Booking raises the invoice server-side, so payments refresh too.
      invalidatesTags: [{ type: 'VideoSlot', id: 'LIST' }, { type: 'Payment', id: 'LIST' }],
    }),
    deleteVideoSlot: build.mutation<void, string>({
      query: (id) => ({ url: `/video-slots/${id}`, method: 'DELETE' }),
      invalidatesTags: [{ type: 'VideoSlot', id: 'LIST' }],
    }),

    // ── Maternity ────────────────────────────────────────────────────────────
    listPregnancies: build.query<PregnancyRecord[], { patientId?: string; status?: string } | void>({
      query: (params) => ({ url: '/pregnancies', params: params ?? undefined }),
      providesTags: [{ type: 'Pregnancy', id: 'LIST' }],
    }),
    createPregnancy: build.mutation<PregnancyRecord, Partial<PregnancyRecord>>({
      query: (body) => ({ url: '/pregnancies', method: 'POST', body }),
      invalidatesTags: [{ type: 'Pregnancy', id: 'LIST' }],
    }),
    updatePregnancy: build.mutation<PregnancyRecord, { id: string; body: Partial<PregnancyRecord> }>({
      query: ({ id, body }) => ({ url: `/pregnancies/${id}`, method: 'PUT', body }),
      invalidatesTags: [{ type: 'Pregnancy', id: 'LIST' }],
    }),
    listAncVisits: build.query<ANCVisit[], { pregnancyId?: string } | void>({
      query: (params) => ({ url: '/anc-visits', params: params ?? undefined }),
      providesTags: [{ type: 'ANCVisit', id: 'LIST' }],
    }),
    createAncVisit: build.mutation<ANCVisit, Partial<ANCVisit>>({
      query: (body) => ({ url: '/anc-visits', method: 'POST', body }),
      invalidatesTags: [{ type: 'ANCVisit', id: 'LIST' }],
    }),

    // ── Babies ───────────────────────────────────────────────────────────────
    listBabies: build.query<Baby[], { motherPatientId?: string } | void>({
      query: (params) => ({ url: '/babies', params: params ?? undefined }),
      providesTags: [{ type: 'Baby', id: 'LIST' }],
    }),
    createBaby: build.mutation<Baby, Partial<Baby>>({
      query: (body) => ({ url: '/babies', method: 'POST', body }),
      invalidatesTags: [{ type: 'Baby', id: 'LIST' }],
    }),
    listGrowth: build.query<GrowthMeasurement[], string>({
      query: (babyId) => `/babies/${babyId}/growth`,
      providesTags: [{ type: 'Growth', id: 'LIST' }],
    }),
    addGrowth: build.mutation<GrowthMeasurement, { babyId: string; body: Partial<GrowthMeasurement> }>({
      query: ({ babyId, body }) => ({ url: `/babies/${babyId}/growth`, method: 'POST', body }),
      invalidatesTags: [{ type: 'Growth', id: 'LIST' }],
    }),
    listImmunizations: build.query<Immunization[], string>({
      query: (babyId) => `/babies/${babyId}/immunizations`,
      providesTags: [{ type: 'Immunization', id: 'LIST' }],
    }),
    createImmunization: build.mutation<Immunization, { babyId: string; body: Partial<Immunization> }>({
      query: ({ babyId, body }) => ({ url: `/babies/${babyId}/immunizations`, method: 'POST', body }),
      invalidatesTags: [{ type: 'Immunization', id: 'LIST' }],
    }),
    markImmunizationGiven: build.mutation<Immunization, { babyId: string; immunizationId: string; givenDate?: string }>({
      query: ({ babyId, immunizationId, givenDate }) => ({
        url: `/babies/${babyId}/immunizations/${immunizationId}/given`,
        method: 'PUT',
        body: { givenDate },
      }),
      invalidatesTags: [{ type: 'Immunization', id: 'LIST' }],
    }),

    // ── Vitals ────────────────────────────────────────────────────────────────
    listVitals: build.query<
      Vitals[],
      { patientId?: string; appointmentId?: string } | void
    >({
      query: (params) => ({ url: '/vitals', params: params ?? undefined }),
      providesTags: [{ type: 'Vitals', id: 'LIST' }],
    }),
    createVitals: build.mutation<Vitals, VitalsCreateBody & { hospitalId?: string }>({
      query: ({ hospitalId, ...body }) => ({
        url: '/vitals',
        method: 'POST',
        body,
        headers: hospitalId ? { 'X-Hospital-Id': hospitalId } : undefined,
      }),
      // Invalidate both Vitals and Appointments: the appointments list carries
      // the hasVitals flag, and it won't re-fetch unless its tag is busted too.
      invalidatesTags: [
        { type: 'Vitals', id: 'LIST' },
        { type: 'Appointment', id: 'LIST' },
      ],
    }),
    updateVitals: build.mutation<Vitals, { id: string; body: Partial<VitalsCreateBody> }>({
      query: ({ id, body }) => ({ url: `/vitals/${id}`, method: 'PUT', body }),
      invalidatesTags: [{ type: 'Vitals', id: 'LIST' }],
    }),
    deleteVitals: build.mutation<void, string>({
      query: (id) => ({ url: `/vitals/${id}`, method: 'DELETE' }),
      invalidatesTags: [
        { type: 'Vitals', id: 'LIST' },
        { type: 'Appointment', id: 'LIST' },
      ],
    }),
  }),
});

// Export hooks (auto-generated by RTK Query)
export const {
  useGetSuperadminOverviewQuery,
  useGetSuperadminPatientsQuery,
  useGetSuperadminDoctorsQuery,
  useGetSuperadminAppointmentsQuery,
  useGetSuperadminDepartmentsQuery,
  useGetSuperadminUsersQuery,
  useGetSuperadminPatientsPagedQuery,
  useLazyGetSuperadminPatientsPagedQuery,
  useGetSuperadminDoctorsPagedQuery,
  useLazyGetSuperadminDoctorsPagedQuery,
  useGetSuperadminAppointmentsPagedQuery,
  useLazyGetSuperadminAppointmentsPagedQuery,
  useGetSuperadminDepartmentsPagedQuery,
  useLazyGetSuperadminDepartmentsPagedQuery,
  useGetSuperadminUsersPagedQuery,
  useLazyGetSuperadminUsersPagedQuery,
  useListRolesQuery,
  useListAssignableRolesQuery,
  useListPermissionsQuery,
  useCreateRoleMutation,
  useUpdateRoleMutation,
  useDeleteRoleMutation,
  useGetCurrentHospitalQuery,
  useGetHospitalOperationalQuery,
  useUpdateHospitalOperationalMutation,
  useListPublicHospitalsQuery,
  useListHospitalsQuery,
  useGetHospitalDetailQuery,
  useGetMyHospitalSettingsQuery,
  useUploadMyHospitalLogoMutation,
  useRemoveMyHospitalLogoMutation,
  useUpdateMyHospitalSettingsMutation,
  useGetOnboardingMetaQuery,
  useOnboardHospitalMutation,
  useUpdateHospitalMutation,
  useDeleteHospitalMutation,
  useReplaceHospitalProfileMutation,
  useAddHospitalLicenceMutation,
  useUpdateHospitalLicenceMutation,
  useDeleteHospitalLicenceMutation,
  useUploadHospitalDocumentMutation,
  useDeleteHospitalDocumentMutation,
  useReplaceHospitalSubscriptionMutation,
  useLoginMutation,
  useRegisterMutation,
  useLogoutMutation,
  useLogoutAllMutation,
  useForgotPasswordMutation,
  useResetPasswordMutation,
  useUpdatePrescriptionMutation,
  useDeletePrescriptionMutation,
  useCancelTestOrderMutation,
  useUpdateVitalsMutation,
  useDeleteVitalsMutation,
  useListConsentPurposesQuery,
  useListConsentsQuery,
  useCreateConsentMutation,
  useWithdrawConsentMutation,
  useMeQuery,
  useListAppointmentsQuery,
  useListAppointmentsPagedQuery,
  useLazyListAppointmentsPagedQuery,
  useGetAppointmentStatsQuery,
  useGetAppointmentQuery,
  useCreateAppointmentMutation,
  useUpdateAppointmentMutation,
  useListPatientsQuery,
  useListPatientsPagedQuery,
  useLazyListPatientsPagedQuery,
  useGetPatientQuery,
  useGetPatientByUserQuery,
  useUpdatePatientMutation,
  useDeletePatientMutation,
  useGetPatientAppointmentsQuery,
  useGetPatientMedicalRecordsQuery,
  useGetPatientPaymentsQuery,
  useGetPatientPrescriptionsQuery,
  useGetPatientVitalsQuery,
  useListDoctorsQuery,
  useListDoctorsPagedQuery,
  useLazyListDoctorsPagedQuery,
  useGetDoctorQuery,
  useGetDoctorByUserQuery,
  useGetDoctorAppointmentsQuery,
  useGetDoctorAvailabilityQuery,
  useListDepartmentsQuery,
  useListDepartmentsPagedQuery,
  useLazyListDepartmentsPagedQuery,
  useCreateDepartmentMutation,
  useUpdateDepartmentMutation,
  useDeleteDepartmentMutation,
  useListMedicalRecordsQuery,
  useCreateMedicalRecordMutation,
  useListPrescriptionsQuery,
  useListPrescriptionsPagedQuery,
  useLazyListPrescriptionsPagedQuery,
  useCreatePrescriptionMutation,
  useListPaymentsQuery,
  useListPaymentsPagedQuery,
  useLazyListPaymentsPagedQuery,
  useCreatePaymentMutation,
  useInitiatePaymentMutation,
  useVerifyPaymentMutation,
  useGetRazorpaySettingsQuery,
  useUpdateRazorpaySettingsMutation,
  useListVitalsQuery,
  useListVitalsPagedQuery,
  useLazyListVitalsPagedQuery,
  useCreateVitalsMutation,
  useListUsersQuery,
  useListUsersPagedQuery,
  useLazyListUsersPagedQuery,
  useCreateUserMutation,
  useUpdateOwnAccountMutation,
  useUpdateUserMutation,
  useDeleteUserMutation,
  useUpdateDoctorMutation,
  useDeleteDoctorMutation,
  useDeleteAppointmentMutation,
  useListMedicinesQuery,
  useListMedicinesPagedQuery,
  useLazyListMedicinesPagedQuery,
  useCreateMedicineMutation,
  useUpdateMedicineMutation,
  useDeleteMedicineMutation,
  useListMedicationOrdersQuery,
  useCreateMedicationOrderMutation,
  useDispenseMedicationOrderMutation,
  useAdministerMedicationOrderMutation,
  useCancelMedicationOrderMutation,
  useBillMedicationOrderMutation,
  useListInventoryMovementsQuery,
  useListLowStockQuery,
  useRestockMedicineMutation,
  useAdjustInventoryMutation,
  useListLabTestsQuery,
  useListLabTestsPagedQuery,
  useLazyListLabTestsPagedQuery,
  useCreateLabTestMutation,
  useUpdateLabTestMutation,
  useDeleteLabTestMutation,
  useListTestOrdersQuery,
  useListTestOrdersPagedQuery,
  useLazyListTestOrdersPagedQuery,
  useGetTestOrderQuery,
  useCreateTestOrderMutation,
  useUpdateTestOrderMutation,
  useDeleteTestOrderMutation,
  useReviewTestOrderMutation,
  useListTestResultsQuery,
  useLazyListTestResultsQuery,
  useUpsertTestResultMutation,
  useListScheduleBlocksQuery,
  useCreateScheduleBlockMutation,
  useDeleteScheduleBlockMutation,
  useListVideoSlotsQuery,
  useCreateVideoSlotMutation,
  useBookVideoSlotMutation,
  useDeleteVideoSlotMutation,
  useListPregnanciesQuery,
  useListPregnanciesPagedQuery,
  useLazyListPregnanciesPagedQuery,
  useCreatePregnancyMutation,
  useUpdatePregnancyMutation,
  useListAncVisitsQuery,
  useCreateAncVisitMutation,
  useListBabiesQuery,
  useListBabiesPagedQuery,
  useLazyListBabiesPagedQuery,
  useCreateBabyMutation,
  useListGrowthQuery,
  useAddGrowthMutation,
  useListImmunizationsQuery,
  useCreateImmunizationMutation,
  useMarkImmunizationGivenMutation,
  useRegisterFcmTokenMutation,
  useUnregisterFcmTokenMutation,
} = api;
