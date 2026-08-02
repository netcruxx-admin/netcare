'use client';

import type { FormikProps } from 'formik';
import { Calendar, Droplet } from 'lucide-react';
import { FormField } from '@/components/form/FormField';
import { BLOOD_GROUPS, FormValues, GENDERS } from '../registrationSchemas';

interface DetailsStepProps {
  formik: FormikProps<FormValues>;
  onBack: () => void;
}

// Final step: the patient's own health details. Staff accounts are provisioned
// by the hospital through POST /users, so there is no clinician branch here.
export function DetailsStep({ formik, onBack }: DetailsStepProps) {
  const genderOptions = GENDERS.map((g) => ({ value: g, label: g }));
  const bloodGroupOptions = BLOOD_GROUPS.map((b) => ({ value: b, label: b }));

  return (
    <form onSubmit={formik.handleSubmit} className="space-y-4" noValidate>
      <p className="text-sm text-slate-500">
        These help us personalize your care. You can update them anytime from your profile.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField name="dateOfBirth" label="Date of Birth" type="date" icon={Calendar} />
        <FormField name="gender" label="Gender" as="select" placeholder="Select…" options={genderOptions} />
        <FormField name="bloodGroup" label="Blood Group" as="select" placeholder="Select…" options={bloodGroupOptions} icon={Droplet} />
        <FormField name="allergies" label="Known Allergies" placeholder="e.g. Penicillin (or None)" />
        <div className="sm:col-span-2">
          <FormField name="chronicDiseases" label="Chronic Conditions" placeholder="e.g. Diabetes, Hypertension (or None)" />
        </div>
        <FormField name="emergencyContact" label="Emergency Contact Name" placeholder="Full name" />
        <FormField name="emergencyPhone" label="Emergency Contact Phone" type="tel" placeholder="+91 98765 43210" />
        <FormField name="insuranceProvider" label="Insurance Provider" placeholder="e.g. Star Health" />
        <FormField name="insuranceNumber" label="Insurance Number" placeholder="Policy / member ID" />
      </div>

      <button
        type="submit"
        disabled={formik.isSubmitting}
        className="w-full bg-gradient-to-r from-cyan-500 to-brand-teal text-white py-2 rounded-lg font-semibold hover:shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {formik.isSubmitting ? 'Creating account...' : 'Create Account'}
      </button>

      <button
        type="button"
        onClick={onBack}
        className="w-full text-center text-cyan-600 font-semibold hover:text-cyan-700"
      >
        Back
      </button>
    </form>
  );
}
