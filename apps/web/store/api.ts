import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type {
  Appointment,
  Department,
  Doctor,
  MedicalRecord,
  Patient,
  Payment,
  Prescription,
  User,
  Vitals,
} from '@/lib/types';
import { AUTH_SESSION_KEY } from '@/lib/constants';
import { getCurrentHospitalId } from '@/lib/tenant';

// ---------------------------------------------------------------------------
// Auth session shape returned by the real backend
// ---------------------------------------------------------------------------
export interface ApiAuthResponse {
  user: User;
  patient?: Patient;
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
        // Attach tenant id so the backend scopes correctly
        headers.set('X-Hospital-Id', getCurrentHospitalId());
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
  ],

  endpoints: (build) => ({
    // ── Hospitals ────────────────────────────────────────────────────────────
    getCurrentHospital: build.query<HospitalInfo, void>({
      query: () => '/hospitals/current',
      providesTags: ['Hospital'],
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
    createAppointment: build.mutation<Appointment, AppointmentCreateBody>({
      query: (body) => ({ url: '/appointments', method: 'POST', body }),
      invalidatesTags: [{ type: 'Appointment', id: 'LIST' }],
    }),
    updateAppointment: build.mutation<
      Appointment,
      { id: string; body: AppointmentUpdateBody }
    >({
      query: ({ id, body }) => ({ url: `/appointments/${id}`, method: 'PUT', body }),
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
    updatePatient: build.mutation<Patient, { id: string; body: PatientUpdateBody }>({
      query: ({ id, body }) => ({ url: `/patients/${id}`, method: 'PUT', body }),
      invalidatesTags: (_r, _e, { id }) => [{ type: 'Patient', id }],
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
      { id: string; body: DepartmentUpdateBody }
    >({
      query: ({ id, body }) => ({ url: `/departments/${id}`, method: 'PUT', body }),
      invalidatesTags: (_r, _e, { id }) => [{ type: 'Department', id }],
    }),
    deleteDepartment: build.mutation<void, string>({
      query: (id) => ({ url: `/departments/${id}`, method: 'DELETE' }),
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

    // ── Vitals ────────────────────────────────────────────────────────────────
    listVitals: build.query<
      Vitals[],
      { patientId?: string; appointmentId?: string } | void
    >({
      query: (params) => ({ url: '/vitals', params: params ?? undefined }),
      providesTags: [{ type: 'Vitals', id: 'LIST' }],
    }),
    createVitals: build.mutation<Vitals, VitalsCreateBody>({
      query: (body) => ({ url: '/vitals', method: 'POST', body }),
      invalidatesTags: [{ type: 'Vitals', id: 'LIST' }],
    }),
  }),
});

// Export hooks (auto-generated by RTK Query)
export const {
  useGetCurrentHospitalQuery,
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
  useGetPatientAppointmentsQuery,
  useGetPatientMedicalRecordsQuery,
  useGetPatientPaymentsQuery,
  useGetPatientPrescriptionsQuery,
  useGetPatientVitalsQuery,
  useListDoctorsQuery,
  useGetDoctorQuery,
  useGetDoctorByUserQuery,
  useGetDoctorAppointmentsQuery,
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
} = api;
