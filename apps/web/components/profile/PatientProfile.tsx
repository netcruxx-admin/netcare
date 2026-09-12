'use client';

import { useEffect, useState } from 'react';
import { Formik, Form, useFormikContext } from 'formik';
import * as Yup from 'yup';
import { ChevronRight, Pencil, X } from 'lucide-react';
import { toast } from 'sonner';
import { apiError } from '@/lib/apiError';
import { DashboardShell } from '@/components/DashboardShell';
import type { RoleViewProps } from '@/components/RoleView';
import { ChangePasswordForm } from '@/components/auth/ChangePasswordForm';
import {
  useGetPatientByUserQuery,
  useUpdatePatientMutation,
  useUpdateOwnAccountMutation,
} from '@/store/api';
import { FormField } from '@/components/form/FormField';
import { PhoneField, toPhoneDigits, withPrefix } from '@/components/form/PhoneField';
import {
  PatientAddressFields,
  RELATION_OPTIONS,
  emptyPatientProfile,
  formatPatientAddress,
  formatRelationLine,
  patientProfilePayload,
  patientProfileSchemaFields,
  patientProfileValues,
} from '@/components/patients/patientProfile';
import { requireEmailOrPhone } from '@/lib/contactMethod';
import { maskAadhaar } from '@/lib/aadhaar';
import { ConsentSettings } from './ConsentSettings';
import { Spinner } from '@/components/ui/spinner';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface FormValues {
  name: string;
  email: string;
  dateOfBirth: string;
  gender: string;
  relationType: string;
  relationName: string;
  phone: string;
  emergencyContact: string;
  emergencyPhone: string;
  emergencyRelationship: string;
  bloodGroup: string;
  insuranceProvider: string;
  insuranceNumber: string;
  // The same identity and address fields the registration forms collect, so a
  // patient can keep their own record complete rather than ringing the desk.
  aadhaarNumber: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  district: string;
  state: string;
  pincode: string;
  country: string;
}

const schema = Yup.object({
  ...patientProfileSchemaFields,
  name: Yup.string().trim().required('Name is required'),
  // Neither is required on its own — see requireEmailOrPhone — since login
  // accepts either (see /auth login).
  email: requireEmailOrPhone(Yup.string().trim().email('Enter a valid email')),
  phone: Yup.string().test('phone', 'Enter a valid 10-digit mobile number', (v) =>
    !v || /^\d{10}$/.test(v),
  ),
});

// Fields that belong to each step — used to scope Next-button validation.
const STEP_FIELDS: Record<number, (keyof FormValues)[]> = {
  1: ['name', 'email', 'dateOfBirth', 'gender', 'relationType', 'relationName', 'aadhaarNumber'],
  2: ['phone', 'emergencyContact', 'emergencyPhone', 'emergencyRelationship', 'addressLine1', 'city', 'pincode'],
  3: ['bloodGroup'],
  4: ['insuranceProvider', 'insuranceNumber'],
};

const steps = [
  { number: 1, title: 'Personal Info' },
  { number: 2, title: 'Contact & Address' },
  { number: 3, title: 'Blood Group' },
  { number: 4, title: 'Insurance' },
];

const genderOptions = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
];

const bloodGroupOptions = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'].map((v) => ({
  value: v,
  label: v,
}));

/** Inner component so it can use both useFormikContext and its own useState. */
function WizardContent({ isSaving }: { isSaving: boolean }) {
  const { setFieldTouched, validateForm, isSubmitting, dirty } = useFormikContext<FormValues>();
  const [currentStep, setCurrentStep] = useState(1);

  const handleNext = async () => {
    const fields = STEP_FIELDS[currentStep];
    // Touch every field in this step so errors become visible.
    fields.forEach((f) => setFieldTouched(f, true));
    const errs = await validateForm();
    const hasErrors = fields.some((f) => !!errs[f]);
    if (!hasErrors) setCurrentStep((s) => s + 1);
  };

  return (
    <>
      {/* Progress Steps */}
      <div className="flex justify-between items-center">
        {steps.map((step, idx) => (
          <div key={step.number} className="flex items-center flex-1">
            <button
              type="button"
              onClick={() => setCurrentStep(step.number)}
              className={cn(
                'w-10 h-10 rounded-full flex items-center justify-center font-bold transition',
                step.number <= currentStep
                  ? buttonVariants({ variant: 'brand' })
                  : 'bg-slate-200 text-slate-600',
              )}
            >
              {step.number}
            </button>
            {idx < steps.length - 1 && (
              <div
                className={`flex-1 h-1 mx-2 ${
                  step.number < currentStep
                    ? 'bg-gradient-to-r from-cyan-500 to-brand-teal'
                    : 'bg-slate-200'
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step 1: Personal Info */}
      {currentStep === 1 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-slate-900">Personal Information</h3>
          <FormField name="name" label="Full Name" placeholder="e.g. Rahul Sharma" required />
          <FormField name="email" label="Email" type="email" placeholder="you@example.com" />
          <FormField name="dateOfBirth" label="Date of Birth" type="date" />
          <FormField
            name="gender"
            label="Gender"
            as="select"
            placeholder="Select Gender"
            options={genderOptions}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              name="relationType"
              label="Relation"
              as="select"
              placeholder="Wife of / Daughter of / Baby of…"
              options={RELATION_OPTIONS}
            />
            <FormField name="relationName" label="Relative's Name" placeholder="e.g. Ramesh Kumar" />
          </div>
          <FormField name="aadhaarNumber" label="Aadhaar Number" placeholder="1234 5678 9012" />
          <p className="text-xs text-slate-400">
            Optional. It is used only so the hospital recognises you as the same person on a
            later visit.
          </p>
        </div>
      )}

      {/* Step 2: Contact Details */}
      {currentStep === 2 && (
        <div className="space-y-6">
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-slate-900">Contact Details</h3>
            <PhoneField name="phone" label="Phone Number" />
            <FormField
              name="emergencyContact"
              label="Emergency Contact Name"
              placeholder="e.g. Priya Sharma"
            />
            <PhoneField name="emergencyPhone" label="Emergency Contact Phone" />
            <FormField
              name="emergencyRelationship"
              label="Relationship to You"
              placeholder="e.g. Spouse, Parent, Sibling"
            />
          </div>
          <PatientAddressFields />
        </div>
      )}

      {/* Step 3: Blood Group */}
      {currentStep === 3 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-slate-900">Blood Group</h3>
          <FormField
            name="bloodGroup"
            label="Blood Group"
            as="select"
            placeholder="Select Blood Group"
            options={bloodGroupOptions}
          />
        </div>
      )}

      {/* Step 4: Insurance */}
      {currentStep === 4 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-slate-900">Insurance Information</h3>
          <FormField
            name="insuranceProvider"
            label="Insurance Provider"
            placeholder="e.g., Star Health"
          />
          <FormField
            name="insuranceNumber"
            label="Insurance Number"
            placeholder="e.g., SH123456"
          />
          <div className="bg-cyan-50 border border-cyan-200 rounded-lg p-4">
            <p className="text-sm text-cyan-800">
              Insurance information is optional but helps with billing and coverage verification.
            </p>
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex gap-4 pt-6">
        {currentStep > 1 && (
          <button
            type="button"
            onClick={() => setCurrentStep((s) => s - 1)}
            className="flex-1 px-6 py-2 border-2 border-slate-300 text-slate-700 font-semibold rounded-lg hover:bg-slate-50 transition"
          >
            Previous
          </button>
        )}
        {currentStep < 4 ? (
          <Button
            key="next"
            type="button"
            onClick={handleNext}
            variant="brand"
            className="flex-1"
          >
            Next <ChevronRight className="w-5 h-5" />
          </Button>
        ) : (
          <Button
            key="submit"
            type="submit"
            disabled={isSubmitting || isSaving || !dirty}
            variant="brand"
            className="flex-1"
          >
            {isSubmitting || isSaving ? <Spinner size="sm" label="Saving…" /> : 'Save Profile'}
          </Button>
        )}
      </div>
    </>
  );
}

export function PatientProfile({ session }: RoleViewProps) {
  const { data: patient, isLoading } = useGetPatientByUserQuery(session.user.id);
  const [updatePatient, { isLoading: isSavingPatient }] = useUpdatePatientMutation();
  const [updateOwnAccount, { isLoading: isSavingAccount }] = useUpdateOwnAccountMutation();
  const isSaving = isSavingPatient || isSavingAccount;
  const [isEditing, setIsEditing] = useState(false);

  // Scroll to consent section if navigated here with #consent-section hash
  // (e.g. from the consent gate on other pages).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.location.hash === '#consent-section') {
      const el = document.getElementById('consent-section');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }, [isLoading]);

  // The patient's own record as form values, plus the two account fields that
  // live on the user rather than the patient row.
  const profileValues = patient ? patientProfileValues(patient) : emptyPatientProfile;
  const initialValues: FormValues = {
    ...profileValues,
    name: session.user.name ?? '',
    email: session.user.email ?? '',
    phone: toPhoneDigits(patient?.phone || session.user.phone || ''),
  };


  return (
    <DashboardShell
      role={session.user.role}
      userName={session.user.name}
      title="Profile"
      subtitle="Manage your health information"
      loading={isLoading}
    >
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="w-full bg-white rounded-lg shadow p-6 space-y-6">
          {/* Header with edit toggle */}
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">{isEditing ? 'Edit Profile' : 'Profile Details'}</h2>
            <div className="relative group">
              <button
                type="button"
                onClick={() => setIsEditing((v) => !v)}
                className="p-1.5 rounded-md text-slate-400 hover:text-cyan-600 hover:bg-cyan-50 transition"
              >
                {isEditing ? <X className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
              </button>
              <div className="absolute right-0 top-full mt-1.5 px-2 py-1 text-xs text-white bg-slate-700 rounded shadow-md whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-10">
                {isEditing ? 'Cancel editing' : 'Edit profile'}
              </div>
            </div>
          </div>

          {!isEditing ? (
            /* ── Read-only view ── */
            <div className="space-y-6">
              <div>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Personal Information</h3>
                <dl className="grid sm:grid-cols-2 gap-x-8 gap-y-4 text-sm">
                  <div>
                    <dt className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-0.5">Full Name</dt>
                    <dd className="text-slate-800 font-medium">{session.user.name || 'None'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-0.5">Email</dt>
                    <dd className="text-slate-800 font-medium">{session.user.email || 'None'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-0.5">Date of Birth</dt>
                    <dd className="text-slate-800 font-medium">{patient?.dateOfBirth || 'None'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-0.5">Gender</dt>
                    <dd className="text-slate-800 font-medium capitalize">{patient?.gender || 'None'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-0.5">Relation</dt>
                    <dd className="text-slate-800 font-medium">
                      {formatRelationLine(patient?.relationType, patient?.relationName) || 'None'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-0.5">Aadhaar</dt>
                    {/* Masked in the read-only view: the last four are enough to
                        confirm the right number is on file, and the full one is
                        there in the edit form for whoever needs to correct it. */}
                    <dd className="text-slate-800 font-medium">{maskAadhaar(patient?.aadhaarNumber ?? '') || 'None'}</dd>
                  </div>
                </dl>
              </div>

              <div className="border-t border-slate-100 pt-5">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Contact Details</h3>
                <dl className="grid sm:grid-cols-2 gap-x-8 gap-y-4 text-sm">
                  <div>
                    <dt className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-0.5">Phone Number</dt>
                    <dd className="text-slate-800 font-medium">{patient?.phone || session.user.phone || 'None'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-0.5">Emergency Contact</dt>
                    <dd className="text-slate-800 font-medium">{patient?.emergencyContact || 'None'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-0.5">Emergency Phone</dt>
                    <dd className="text-slate-800 font-medium">{patient?.emergencyPhone || 'None'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-0.5">Relationship</dt>
                    <dd className="text-slate-800 font-medium">{patient?.emergencyRelationship || 'None'}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-0.5">Address</dt>
                    <dd className="text-slate-800 font-medium">
                      {patient ? formatPatientAddress(patient) || 'None' : 'None'}
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="border-t border-slate-100 pt-5">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Blood Group</h3>
                <dl className="grid sm:grid-cols-2 gap-x-8 gap-y-4 text-sm">
                  <div>
                    <dt className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-0.5">Blood Group</dt>
                    <dd className="text-slate-800 font-medium">{patient?.bloodGroup || 'None'}</dd>
                  </div>
                </dl>
              </div>

              <div className="border-t border-slate-100 pt-5">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Insurance</h3>
                <dl className="grid sm:grid-cols-2 gap-x-8 gap-y-4 text-sm">
                  <div>
                    <dt className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-0.5">Insurance Provider</dt>
                    <dd className="text-slate-800 font-medium">{patient?.insuranceProvider || 'None'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-0.5">Insurance Number</dt>
                    <dd className="text-slate-800 font-medium">{patient?.insuranceNumber || 'None'}</dd>
                  </div>
                </dl>
              </div>
            </div>
          ) : (
            /* ── Edit form (wizard) ── */
            <Formik
              initialValues={initialValues}
              enableReinitialize
              validationSchema={schema}
              onSubmit={async (values, { setSubmitting }) => {
                if (!patient) return;
                try {
                  await Promise.all([
                    updatePatient({
                      id: patient.id,
                      body: patientProfilePayload(values),
                    }).unwrap(),
                    updateOwnAccount({
                      name: values.name.trim() || undefined,
                      email: values.email.trim() || undefined,
                      phone: withPrefix(values.phone) || undefined,
                    }).unwrap(),
                  ]);
                  toast.success('Profile updated');
                  setIsEditing(false);
                } catch (err) {
                  toast.error(apiError(err, 'Could not save your profile. Please try again.'));
                } finally {
                  setSubmitting(false);
                }
              }}
            >
              <Form className="space-y-6">
                <WizardContent isSaving={isSaving} />
              </Form>
            </Formik>
          )}
        </div>

        {/* Consent is a persistent setting, not a one-time setup step. */}
        <ConsentSettings dateOfBirth={patient?.dateOfBirth ?? ''} />

        <PasswordCard />
      </div>
    </DashboardShell>
  );
}

/** The voluntary change, for someone who simply wants a new password rather
 *  than one that was handed to them. Its own card because it is a security
 *  action, not a profile field: it ends every other session, and burying it
 *  inside a form with one Save button would misstate when that happens. */
function PasswordCard() {
  return (
    <div className="bg-white rounded-lg shadow-lg p-6 space-y-4">
      <div>
        <h2 className="font-bold text-lg text-slate-900">Password</h2>
        <p className="text-sm text-slate-500">
          Changing it signs you out on every other device, and keeps you signed
          in here.
        </p>
      </div>
      <div className="max-w-md">
        <ChangePasswordForm />
      </div>
    </div>
  );
}
