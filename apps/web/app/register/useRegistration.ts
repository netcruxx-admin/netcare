'use client';

// All state + business logic for the registration wizard: step navigation, the
// Formik instance (with per-step validation), and final account creation. The
// page and step components stay purely presentational and read from what this
// returns.
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFormik } from 'formik';
import { authStorage } from '@/lib/auth';
import { resolveHomePath } from '@/lib/roles';
import { useRegisterMutation } from '@/store/api';
import {
  accountSchema,
  ageFromDateOfBirth,
  AGE_OF_MAJORITY,
  consentSchema,
  FormValues,
  initialValues,
  patientDetailsSchema,
  Role,
  Step,
} from './registrationSchemas';

export function useRegistration() {
  const router = useRouter();
  const [registerMutation] = useRegisterMutation();
  const [step, setStep] = useState<Step>('role');
  const [userType, setUserType] = useState<Role | null>(null);
  const [serverError, setServerError] = useState('');
  const [success, setSuccess] = useState(false);

  // Validate only the fields relevant to the current step.
  const validationSchema = useMemo(() => {
    if (step === 'account') return accountSchema;
    if (step === 'consent') return consentSchema;
    return patientDetailsSchema;
  }, [step]);

  const doRegister = async (values: FormValues) => {
    setServerError('');

    try {
      const result = await registerMutation({
        email: values.email,
        password: values.password,
        name: values.name,
        role: 'patient',
        phone: values.phone.trim(),
        // Sent so the backend can tell whether this is a minor, which decides
        // whether it demands a guardian on the consent (DPDP s.9).
        dateOfBirth: values.dateOfBirth,
        gender: values.gender,
        bloodGroup: values.bloodGroup,
        consents: values.consents,
        guardianName: values.guardianName.trim(),
        guardianRelationship: values.guardianRelationship.trim(),
      }).unwrap();

      authStorage.setSession({
        user: result.user,
        patient: result.patient,
        hospitalId: result.user.hospitalId ?? '',
        role: result.role,
        permissions: result.permissions,
        token: result.token,
        refreshToken: result.refreshToken,
        isAuthenticated: true,
      });
      setSuccess(true);

      setTimeout(() => {
        // New patients go straight to their profile to finish filling it in;
        // everyone else lands on whatever dashboard their role declares.
        const role = result.user.role;
        router.push(
          role === 'patient'
            ? '/dashboard/profile'
            : resolveHomePath(role, result.role?.homePath),
        );
      }, 2000);
    } catch (err: unknown) {
      const detail = (err as { data?: { detail?: string } })?.data?.detail;
      if (detail?.toLowerCase().includes('already')) {
        setServerError('Email already registered');
        setStep('account');
      } else if (detail?.toLowerCase().includes('consent') || detail?.toLowerCase().includes('guardian')) {
        // The consents are the only thing the last step controls, so send the
        // user back to the step that can actually fix the refusal.
        setServerError(detail);
        setStep('consent');
      } else {
        setServerError(detail ?? 'An error occurred. Please try again.');
      }
    }
  };

  const formik = useFormik<FormValues>({
    initialValues,
    validationSchema,
    validateOnMount: false,
    onSubmit: async (values, { setSubmitting }) => {
      // The first two steps only advance; the account is created on the last
      // one, so that no data is submitted before the notice has been shown.
      if (step === 'account') {
        setStep('details');
        setSubmitting(false);
        return;
      }
      if (step === 'details') {
        setStep('consent');
        setSubmitting(false);
        return;
      }
      await doRegister(values);
      setSubmitting(false);
    },
  });

  const handleRoleSelect = (role: Role) => {
    setUserType(role);
    setStep('account');
    setServerError('');
  };

  const backToRole = () => {
    setStep('role');
    setUserType(null);
    setServerError('');
    formik.resetForm();
  };

  const goToStep = (next: Step) => {
    setStep(next);
    setServerError('');
  };

  // Progress indicator: the named steps and where we are in them.
  const wizardSteps = ['Account', 'Details', 'Consent'];
  const stepOrder: Step[] = ['account', 'details', 'consent'];
  const currentIndex = Math.max(0, stepOrder.indexOf(step));

  // Drives the guardian fields on the consent step. The backend makes the real
  // decision — this only decides what to ask for.
  const age = ageFromDateOfBirth(formik.values.dateOfBirth);
  const isMinor = age !== null && age < AGE_OF_MAJORITY;

  return {
    // state
    step,
    userType,
    serverError,
    success,
    formik,
    // derived
    wizardSteps,
    currentIndex,
    isMinor,
    // actions
    doRegister,
    handleRoleSelect,
    backToRole,
    goToStep,
  };
}
