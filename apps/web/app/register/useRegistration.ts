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
import { useRegisterMutation, type HospitalPublicInfo } from '@/store/api';
import { currentSubdomain } from '@/lib/tenant';
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
  // On the root domain (no subdomain) we don't know which hospital the patient
  // belongs to — show a picker first. On a hospital subdomain, skip straight to
  // the role step (tenant is already resolved from the URL).
  const isRootDomain = typeof window !== 'undefined' && currentSubdomain() === null;
  const [step, setStep] = useState<Step>(isRootDomain ? 'hospital' : 'role');
  const [selectedHospital, setSelectedHospital] = useState<HospitalPublicInfo | null>(null);
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

    // Client-side guardian check — mirrors the backend rule so the user sees
    // the error inline before any network request is made.
    const age = ageFromDateOfBirth(values.dateOfBirth);
    const minor = age !== null && age < AGE_OF_MAJORITY;
    if (minor && !values.guardianName.trim()) {
      setServerError('Parent / Guardian name is required for patients under 18.');
      return;
    }

    try {
      const result = await registerMutation({
        email: values.email,
        password: values.password,
        name: values.name,
        role: 'patient',
        phone: values.phone.trim() ? `+91${values.phone.trim()}` : '',
        // Sent so the backend can tell whether this is a minor, which decides
        // whether it demands a guardian on the consent (DPDP s.9).
        dateOfBirth: values.dateOfBirth,
        gender: values.gender,
        bloodGroup: values.bloodGroup,
        allergies: values.allergies.trim() || undefined,
        chronicDiseases: values.chronicDiseases.trim() || undefined,
        emergencyContact: values.emergencyContact.trim() || undefined,
        emergencyPhone: values.emergencyPhone.trim() ? `+91${values.emergencyPhone.trim()}` : undefined,
        insuranceProvider: values.insuranceProvider.trim() || undefined,
        insuranceNumber: values.insuranceNumber.trim() || undefined,
        consents: values.consents,
        guardianName: values.guardianName.trim(),
        guardianRelationship: values.guardianRelationship.trim(),
        // On root domain the patient picked a hospital; pass it as the tenant
        // header so the backend knows which hospital to file this account under.
        hospitalId: selectedHospital?.id,
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
        const role = result.user.role;
        const path = role === 'patient'
          ? '/dashboard'
          : resolveHomePath(role, result.role?.homePath);

        // When the patient registered via root domain they picked a hospital —
        // redirect to that hospital's subdomain. localStorage is domain-scoped
        // so the session stored here won't be visible there; send them to the
        // subdomain's login page with a ?registered=1 flag so it can show a
        // "Registration successful" message and let them sign in.
        if (selectedHospital) {
          const { protocol, host } = window.location;
          window.location.href = `${protocol}//${selectedHospital.subdomain}.${host}/login?registered=1`;
        } else {
          router.push(path);
        }
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

  const handleHospitalSelect = (hospital: HospitalPublicInfo) => {
    setSelectedHospital(hospital);
    setStep('role');
    setServerError('');
  };

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

  const backToHospital = () => {
    setStep('hospital');
    setSelectedHospital(null);
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
    selectedHospital,
    isRootDomain,
    serverError,
    success,
    formik,
    // derived
    wizardSteps,
    currentIndex,
    isMinor,
    // actions
    doRegister,
    handleHospitalSelect,
    handleRoleSelect,
    backToRole,
    backToHospital,
    goToStep,
  };
}
