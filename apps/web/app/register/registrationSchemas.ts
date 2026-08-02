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
export type Step = 'role' | 'account' | 'details';

export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];
export const GENDERS = ['Female', 'Male', 'Other', 'Prefer not to say'];

const PHONE_REGEX = /^[+]?[\d\s().-]{7,20}$/;

export const initialValues = {
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
};

export type FormValues = typeof initialValues;

export const accountSchema = Yup.object({
  name: Yup.string().trim().required('Full name is required'),
  email: Yup.string().email('Please enter a valid email').required('Email is required'),
  phone: Yup.string()
    .matches(PHONE_REGEX, 'Please enter a valid phone number')
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
  emergencyPhone: Yup.string().matches(PHONE_REGEX, 'Please enter a valid phone number').notRequired(),
});
