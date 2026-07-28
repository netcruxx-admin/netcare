// Constants, validation schemas and the per-role "verify & auto-fill" config
// for the registration wizard. Kept out of the page/hook so the orchestration
// and the presentational steps stay readable.
import * as Yup from 'yup';
import { BadgeCheck, Fingerprint } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { SAMPLE_REGISTRATION_NUMBERS } from '@/lib/doctorRegistry';
import { SAMPLE_NURSE_REGISTRATION_NUMBERS } from '@/lib/nurseRegistry';
import { SAMPLE_AADHAAR_NUMBERS } from '@/lib/aadhaarRegistry';

export type Role = 'patient' | 'doctor' | 'admin' | 'lab' | 'nurse';
export type Step = 'role' | 'verify' | 'account' | 'details';

// Per-role config for the first "verify & auto-fill" step. Patients verify via
// Aadhaar; doctors and nurses via their council registration number.
export interface VerifyConfig {
  field: 'aadhaarNumber' | 'licenseNumber';
  label: string;
  placeholder: string;
  icon: LucideIcon;
  intro: string;
  verifiedTitle: string;
  samples: string[];
}

export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];
export const GENDERS = ['Female', 'Male', 'Other', 'Prefer not to say'];
export const MEDICAL_COUNCILS = [
  'National Medical Commission (NMC)',
  'Andhra Pradesh Medical Council',
  'Delhi Medical Council',
  'Gujarat Medical Council',
  'Karnataka Medical Council',
  'Maharashtra Medical Council',
  'Tamil Nadu Medical Council',
  'Telangana State Medical Council',
  'Uttar Pradesh Medical Council',
  'West Bengal Medical Council',
  'Other',
];

const PHONE_REGEX = /^[+]?[\d\s().-]{7,20}$/;
export const CURRENT_YEAR = new Date().getFullYear();

export const initialValues = {
  // verification
  aadhaarNumber: '',
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
  // doctor details
  licenseNumber: '',
  medicalCouncil: '',
  registrationYear: '',
  qualification: '',
  specialization: '',
  experienceYears: '',
  consultationFee: '',
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

export const licenseSchema = Yup.object({
  licenseNumber: Yup.string().trim().required('Registration number is required'),
});

export const aadhaarSchema = Yup.object({
  aadhaarNumber: Yup.string()
    .transform((v) => (typeof v === 'string' ? v.replace(/\D/g, '') : v))
    .matches(/^\d{12}$/, 'Enter a valid 12-digit Aadhaar number')
    .required('Aadhaar number is required'),
});

export const doctorDetailsSchema = Yup.object({
  licenseNumber: Yup.string().trim().required('Medical registration number is required'),
  qualification: Yup.string().trim().required('Qualification is required'),
  specialization: Yup.string().required('Specialization is required'),
  registrationYear: Yup.number()
    .transform((v, orig) => (orig === '' ? undefined : v))
    .typeError('Enter a valid year')
    .min(1950, 'Enter a valid year')
    .max(CURRENT_YEAR, 'Year cannot be in the future')
    .notRequired(),
  experienceYears: Yup.number()
    .transform((v, orig) => (orig === '' ? undefined : v))
    .typeError('Enter a number')
    .min(0, 'Cannot be negative')
    .max(60, 'Please check this value')
    .notRequired(),
  consultationFee: Yup.number()
    .transform((v, orig) => (orig === '' ? undefined : v))
    .typeError('Enter a number')
    .min(0, 'Cannot be negative')
    .notRequired(),
});

export const VERIFY_CONFIG: Record<'patient' | 'doctor' | 'nurse', VerifyConfig> = {
  patient: {
    field: 'aadhaarNumber',
    label: 'Aadhaar Number',
    placeholder: 'e.g. 2345 6789 0123',
    icon: Fingerprint,
    intro: "Enter your Aadhaar number — we'll fetch your details and fill in the rest for you.",
    verifiedTitle: 'Verified with UIDAI (Aadhaar)',
    samples: SAMPLE_AADHAAR_NUMBERS,
  },
  doctor: {
    field: 'licenseNumber',
    label: 'Medical Registration / License Number',
    placeholder: 'e.g. MH-2012-045678',
    icon: BadgeCheck,
    intro: "Enter your medical registration number — we'll fetch your council-verified details and fill in the rest for you.",
    verifiedTitle: 'Verified with the medical council',
    samples: SAMPLE_REGISTRATION_NUMBERS,
  },
  nurse: {
    field: 'licenseNumber',
    label: 'Nursing Council Registration Number',
    placeholder: 'e.g. INC-2016-118822',
    icon: BadgeCheck,
    intro: "Enter your nursing council registration number — we'll fetch your verified details and fill in the rest for you.",
    verifiedTitle: 'Verified with the nursing council',
    samples: SAMPLE_NURSE_REGISTRATION_NUMBERS,
  },
};
