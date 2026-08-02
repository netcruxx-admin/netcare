import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type {
  ANCVisit,
  Appointment,
  Baby,
  Department,
  Doctor,
  GrowthMeasurement,
  Immunization,
  LabTest,
  MedicalRecord,
  Medicine,
  Patient,
  Payment,
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
  isAuthenticated: boolean;
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
  createdAt: string;
}

export interface HospitalCreateBody {
  name: string;
  subdomain: string;
  category: string;
  theme?: { primary: string; primaryDark: string };
  adminEmail?: string;
  adminPassword?: string;
  adminName?: string;
}

export interface HospitalUpdateBody {
  name?: string;
  tagline?: string;
  currency?: string;
  category?: string;
  theme?: { primary: string; primaryDark: string };
  status?: string;
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
  specialization?: string;
  qualification?: string;
  experienceYears?: number;
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
// RTK Query API slice
// ---------------------------------------------------------------------------
export const api = createApi({
  reducerPath: 'api',

  baseQuery: fetchBaseQuery({
    baseUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000',
    prepareHeaders: (headers) => {
      // Attach JWT from the stored auth session
      if (typeof window !== 'undefined') {
        const raw = localStorage.getItem(AUTH_SESSION_KEY);
        if (raw) {
          try {
            const session = JSON.parse(raw) as { token?: string };
            if (session.token) {
              headers.set('Authorization', `Bearer ${session.token}`);
            }
          } catch {
            // malformed session — skip
          }
        }
        // Attach the tenant hint so the backend scopes correctly. Only set if
        // not already provided per-request (e.g. superadmin editing a record
        // that belongs to a specific hospital), and only when we actually have
        // one — sending an empty or invented id would name a hospital we have
        // no reason to believe in.
        const tenantHint = getCurrentHospitalId();
        if (tenantHint && !headers.has('X-Hospital-Id')) {
          headers.set('X-Hospital-Id', tenantHint);
        }
      }
      return headers;
    },
  }),

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
    getCurrentHospital: build.query<HospitalInfo, void>({
      query: () => '/hospitals/current',
      providesTags: ['Hospital'],
    }),
    listHospitals: build.query<HospitalInfo[], void>({
      query: () => '/hospitals',
      providesTags: ['Hospital'],
    }),
    onboardHospital: build.mutation<HospitalInfo, HospitalCreateBody>({
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

    // ── Auth ─────────────────────────────────────────────────────────────────
    login: build.mutation<ApiAuthResponse, LoginBody>({
      query: (body) => ({ url: '/auth/login', method: 'POST', body }),
    }),
    register: build.mutation<ApiAuthResponse, RegisterBody>({
      query: (body) => ({ url: '/auth/register', method: 'POST', body }),
    }),
    me: build.query<ApiAuthResponse, void>({
      query: () => '/auth/me',
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
      { doctorId: string; date: string }
    >({
      query: ({ doctorId, date }) => ({ url: `/doctors/${doctorId}/availability`, params: { date } }),
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
      invalidatesTags: [{ type: 'Vitals', id: 'LIST' }],
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
  useListRolesQuery,
  useListAssignableRolesQuery,
  useListPermissionsQuery,
  useCreateRoleMutation,
  useUpdateRoleMutation,
  useDeleteRoleMutation,
  useGetCurrentHospitalQuery,
  useListHospitalsQuery,
  useOnboardHospitalMutation,
  useUpdateHospitalMutation,
  useDeleteHospitalMutation,
  useLoginMutation,
  useRegisterMutation,
  useMeQuery,
  useListAppointmentsQuery,
  useGetAppointmentQuery,
  useCreateAppointmentMutation,
  useUpdateAppointmentMutation,
  useListPatientsQuery,
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
  useGetDoctorQuery,
  useGetDoctorByUserQuery,
  useGetDoctorAppointmentsQuery,
  useGetDoctorAvailabilityQuery,
  useListDepartmentsQuery,
  useCreateDepartmentMutation,
  useUpdateDepartmentMutation,
  useDeleteDepartmentMutation,
  useListMedicalRecordsQuery,
  useCreateMedicalRecordMutation,
  useListPrescriptionsQuery,
  useCreatePrescriptionMutation,
  useListPaymentsQuery,
  useCreatePaymentMutation,
  useListVitalsQuery,
  useCreateVitalsMutation,
  useListUsersQuery,
  useCreateUserMutation,
  useUpdateOwnAccountMutation,
  useUpdateUserMutation,
  useDeleteUserMutation,
  useUpdateDoctorMutation,
  useDeleteDoctorMutation,
  useDeleteAppointmentMutation,
  useListMedicinesQuery,
  useCreateMedicineMutation,
  useUpdateMedicineMutation,
  useDeleteMedicineMutation,
  useListLabTestsQuery,
  useCreateLabTestMutation,
  useUpdateLabTestMutation,
  useDeleteLabTestMutation,
  useListTestOrdersQuery,
  useGetTestOrderQuery,
  useCreateTestOrderMutation,
  useUpdateTestOrderMutation,
  useDeleteTestOrderMutation,
  useReviewTestOrderMutation,
  useListTestResultsQuery,
  useUpsertTestResultMutation,
  useListScheduleBlocksQuery,
  useCreateScheduleBlockMutation,
  useDeleteScheduleBlockMutation,
  useListVideoSlotsQuery,
  useCreateVideoSlotMutation,
  useBookVideoSlotMutation,
  useDeleteVideoSlotMutation,
  useListPregnanciesQuery,
  useCreatePregnancyMutation,
  useUpdatePregnancyMutation,
  useListAncVisitsQuery,
  useCreateAncVisitMutation,
  useListBabiesQuery,
  useCreateBabyMutation,
  useListGrowthQuery,
  useAddGrowthMutation,
  useListImmunizationsQuery,
  useCreateImmunizationMutation,
  useMarkImmunizationGivenMutation,
} = api;
