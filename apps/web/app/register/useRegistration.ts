'use client';

// All state + business logic for the registration wizard: step navigation,
// the Formik instance (with per-step validation), the "verify & auto-fill"
// lookups, and final account creation. The page and step components stay
// purely presentational and read from what this returns.
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFormik } from 'formik';
import { authOperations, authStorage, PatientDetails, DoctorDetails } from '@/lib/auth';
import { dbOperations, Department } from '@/lib/db';
import { lookupDoctorRegistration } from '@/lib/doctorRegistry';
import { lookupNurseRegistration } from '@/lib/nurseRegistry';
import { lookupAadhaar } from '@/lib/aadhaarRegistry';
import {
  aadhaarSchema,
  accountSchema,
  doctorDetailsSchema,
  FormValues,
  initialValues,
  licenseSchema,
  patientDetailsSchema,
  Role,
  Step,
  VERIFY_CONFIG,
} from './registrationSchemas';

type LookupState = 'idle' | 'loading' | 'found' | 'notfound';
type Verified = { status?: string; rows: [string, string][] } | null;

export function useRegistration() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('role');
  const [userType, setUserType] = useState<Role | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [serverError, setServerError] = useState('');
  const [success, setSuccess] = useState(false);
  const [lookupState, setLookupState] = useState<LookupState>('idle');
  // Normalized verified result for display, independent of the lookup source.
  const [verified, setVerified] = useState<Verified>(null);

  useEffect(() => {
    setDepartments(dbOperations.getAllDepartments());
  }, []);

  const needsDetails = userType === 'patient' || userType === 'doctor';
  const verifyConfig =
    userType && userType in VERIFY_CONFIG ? VERIFY_CONFIG[userType as keyof typeof VERIFY_CONFIG] : null;
  const hasVerify = !!verifyConfig;

  // Validate only the fields relevant to the current step.
  const validationSchema = useMemo(() => {
    if (step === 'verify') return userType === 'patient' ? aadhaarSchema : licenseSchema;
    if (step === 'account') return accountSchema;
    return userType === 'doctor' ? doctorDetailsSchema : patientDetailsSchema;
  }, [step, userType]);

  const doRegister = async (values: FormValues) => {
    setServerError('');

    const details: PatientDetails | DoctorDetails | undefined =
      userType === 'patient'
        ? {
            dateOfBirth: values.dateOfBirth,
            gender: values.gender,
            bloodGroup: values.bloodGroup,
            allergies: values.allergies,
            chronicDiseases: values.chronicDiseases,
            emergencyContact: values.emergencyContact,
            emergencyPhone: values.emergencyPhone,
            insuranceProvider: values.insuranceProvider,
            insuranceNumber: values.insuranceNumber,
          }
        : userType === 'doctor'
        ? {
            licenseNumber: values.licenseNumber,
            medicalCouncil: values.medicalCouncil,
            registrationYear: values.registrationYear,
            qualification: values.qualification,
            specialization: values.specialization,
            experienceYears: Number(values.experienceYears) || 0,
            consultationFee: Number(values.consultationFee) || 0,
          }
        : undefined;

    try {
      const session = await authOperations.register(
        values.email,
        values.password,
        values.name,
        userType || 'patient',
        values.phone.trim(),
        details
      );

      if (!session) {
        setServerError('Email already registered');
        setStep('account');
        return;
      }

      authStorage.setSession(session);
      setSuccess(true);

      setTimeout(() => {
        if (session.user.role === 'patient') {
          router.push('/dashboard/patient/profile');
        } else if (session.user.role === 'doctor') {
          router.push('/dashboard/doctor');
        } else if (session.user.role === 'lab') {
          router.push('/dashboard/lab');
        } else if (session.user.role === 'nurse') {
          router.push('/dashboard/nurse');
        } else {
          router.push('/dashboard/admin');
        }
      }, 2000);
    } catch (err) {
      setServerError('An error occurred. Please try again.');
    }
  };

  const formik = useFormik<FormValues>({
    initialValues,
    validationSchema,
    validateOnMount: false,
    onSubmit: async (values, { setSubmitting }) => {
      // Patients/doctors/nurses verify (Aadhaar / registration) first, then account.
      if (step === 'verify') {
        setStep('account');
        setSubmitting(false);
        return;
      }
      // On the account step for patient/doctor, "submit" advances to details.
      if (step === 'account' && needsDetails) {
        setStep('details');
        setSubmitting(false);
        return;
      }
      await doRegister(values);
      setSubmitting(false);
    },
  });

  const handleFetchDetails = async () => {
    if (!verifyConfig) return;
    const field = verifyConfig.field;
    const value = String(formik.values[field] ?? '').trim();
    if (!value) {
      formik.setFieldTouched(field, true);
      formik.setFieldError(
        field,
        userType === 'patient' ? 'Enter your Aadhaar number to look up' : 'Enter a registration number to look up'
      );
      return;
    }
    setLookupState('loading');
    setVerified(null);

    if (userType === 'patient') {
      const rec = await lookupAadhaar(value);
      if (!rec) {
        setLookupState('notfound');
        return;
      }
      // Aadhaar fills identity + contact (account) and DOB/gender (details).
      formik.setFieldValue('name', rec.name);
      formik.setFieldValue('phone', rec.phone);
      formik.setFieldValue('dateOfBirth', rec.dateOfBirth);
      formik.setFieldValue('gender', rec.gender);
      setVerified({
        rows: [
          ['Name', rec.name],
          ['Date of birth', rec.dateOfBirth],
          ['Gender', rec.gender],
          ['Phone', rec.phone],
          ['Address', rec.address],
        ],
      });
      setLookupState('found');
      return;
    }

    if (userType === 'doctor') {
      const rec = await lookupDoctorRegistration(value);
      if (!rec) {
        setLookupState('notfound');
        return;
      }
      // Strip any "Dr." prefix — the app adds the title on display.
      formik.setFieldValue('name', rec.name.replace(/^Dr\.?\s*/i, ''));
      formik.setFieldValue('qualification', rec.qualification);
      formik.setFieldValue('specialization', rec.specialization);
      formik.setFieldValue('medicalCouncil', rec.medicalCouncil);
      formik.setFieldValue('registrationYear', rec.registrationYear);
      setVerified({
        status: rec.status,
        rows: [
          ['Name', rec.name],
          ['Council', rec.medicalCouncil],
          ['Qualification', rec.qualification],
          ['Specialization', rec.specialization],
          ['Year of registration', rec.registrationYear],
        ],
      });
      setLookupState('found');
      return;
    }

    // nurse
    const rec = await lookupNurseRegistration(value);
    if (!rec) {
      setLookupState('notfound');
      return;
    }
    formik.setFieldValue('name', rec.name);
    setVerified({
      status: rec.status,
      rows: [
        ['Name', rec.name],
        ['Council', rec.nursingCouncil],
        ['Qualification', rec.qualification],
        ['Year of registration', rec.registrationYear],
      ],
    });
    setLookupState('found');
  };

  const handleRoleSelect = (role: Role) => {
    setUserType(role);
    // Patients (Aadhaar), doctors & nurses (registration) verify first.
    const startsWithVerify = role === 'patient' || role === 'doctor' || role === 'nurse';
    setStep(startsWithVerify ? 'verify' : 'account');
    setServerError('');
  };

  const backToRole = () => {
    setStep('role');
    setUserType(null);
    setServerError('');
    setLookupState('idle');
    setVerified(null);
    formik.resetForm();
  };

  const goToStep = (next: Step) => {
    setStep(next);
    setServerError('');
  };

  // Progress indicator: which named steps apply to this role and where we are.
  const wizardSteps = [...(hasVerify ? ['Verify'] : []), 'Account', ...(needsDetails ? ['Details'] : [])];
  const stepOrder = [...(hasVerify ? ['verify'] : []), 'account', ...(needsDetails ? ['details'] : [])] as Step[];
  const currentIndex = Math.max(0, stepOrder.indexOf(step));

  return {
    // state
    step,
    userType,
    departments,
    serverError,
    success,
    lookupState,
    verified,
    formik,
    // derived
    needsDetails,
    verifyConfig,
    hasVerify,
    wizardSteps,
    currentIndex,
    // actions
    doRegister,
    handleFetchDetails,
    handleRoleSelect,
    backToRole,
    goToStep,
  };
}
