// Constants and validation schemas for the registration wizard. Kept out of the
// page/hook so the orchestration and the presentational steps stay readable.
//
// Public sign-up creates patients only — a staff account carries access to other
// people's records, so the backend provisions those through POST /users
// (`RegisterRole = Literal["patient"]`). There is deliberately no clinician
// branch here, and no identity-verification step: the Aadhaar / medical-council
// lookups that used to sit in front of this form were a hardcoded fixture, not a
// KYC provider. When a real one is wired up (POST /verifications/…), the step
// comes back — against the backend, not a list in the bundle.
import * as Yup from 'yup';

export type Role = 'patient';
export type Step = 'hospital' | 'role' | 'account' | 'details' | 'consent';

export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];
export const GENDERS = ['Female', 'Male', 'Other', 'Prefer not to say'];

const PHONE_REGEX = /^\d{10}$/;

export const initialValues = {
  // hospital picker (only used when on root domain — no subdomain)
  hospitalId: '',
  // account
  name: '',
  email: '',
  phone: '',
  password: '',
  confirmPassword: '',
  // patient details
  dateOfBirth: '',
  gender: '',
  bloodGroup: '',
  emergencyContact: '',
  emergencyPhone: '',
  allergies: '',
  chronicDiseases: '',
  insuranceProvider: '',
  insuranceNumber: '',
  // consent — purpose codes ticked on the notice, and the guardian who ticked
  // them when the patient is under 18 (DPDP s.9).
  consents: [] as string[],
  guardianName: '',
  guardianRelationship: '',
};

export type FormValues = typeof initialValues;

export const accountSchema = Yup.object({
  name: Yup.string().trim().required('Full name is required'),
  email: Yup.string().email('Please enter a valid email').required('Email is required'),
  phone: Yup.string()
    .matches(PHONE_REGEX, 'Enter a valid 10-digit mobile number')
    .required('Phone number is required'),
  password: Yup.string()
    .min(8, 'Password must be at least 8 characters')
    .matches(/[A-Z]/, 'Include at least one uppercase letter')
    .matches(/[a-z]/, 'Include at least one lowercase letter')
    .matches(/[0-9]/, 'Include at least one number')
    .matches(/[^A-Za-z0-9]/, 'Include at least one special character')
    .required('Password is required'),
  confirmPassword: Yup.string()
    .oneOf([Yup.ref('password')], 'Passwords do not match')
    .required('Please confirm your password'),
});

export const patientDetailsSchema = Yup.object({
  emergencyPhone: Yup.string().matches(PHONE_REGEX, 'Enter a valid 10-digit mobile number').notRequired(),
});

/** Age in whole years, or null when no usable date of birth was given.
 *
 *  Mirrors `_age_on` in apps/api/app/consent.py, and unknown means adult in both
 *  places: the backend is the one that refuses a minor's sign-up without a
 *  guardian, so this only decides whether to *show* the guardian fields. */
export function ageFromDateOfBirth(dateOfBirth: string): number | null {
  if (!dateOfBirth) return null;
  const born = new Date(dateOfBirth);
  if (Number.isNaN(born.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - born.getFullYear();
  const beforeBirthday =
    today.getMonth() < born.getMonth() ||
    (today.getMonth() === born.getMonth() && today.getDate() < born.getDate());
  if (beforeBirthday) age -= 1;
  return age;
}

export const AGE_OF_MAJORITY = 18;

/** The consent step validates nothing through Yup — which purposes are required
 *  is the backend's answer, fetched with the notice, so the step gates its own
 *  submit button on that rather than on a schema written here. */
export const consentSchema = Yup.object({});
