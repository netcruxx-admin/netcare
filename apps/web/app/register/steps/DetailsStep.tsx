'use client';

import type { FormikProps } from 'formik';
import { PatientProfileFields } from '@/components/patients/patientProfile';
import { FormValues } from '../registrationSchemas';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';

interface DetailsStepProps {
  formik: FormikProps<FormValues>;
  onBack: () => void;
}

// Final step: the patient's own details. Staff accounts are provisioned by the
// hospital through POST /users, so there is no clinician branch here.
//
// The fields come from PatientProfileFields, the same component the front desk
// fills in on Add Patient and the same one the edit modal shows — one door
// cannot collect less of a person than another.
export function DetailsStep({ formik, onBack }: DetailsStepProps) {
  return (
    <form onSubmit={formik.handleSubmit} className="space-y-6" noValidate>
      <p className="text-sm text-slate-500">
        These help us personalize your care. Everything except your date of birth is
        optional, and you can update it anytime from your profile.
      </p>

      <PatientProfileFields requireDateOfBirth />

      <div className="space-y-4">
        <Button
          type="submit"
          disabled={formik.isSubmitting || !formik.dirty}
          variant="brand"
          className="w-full"
        >
          {formik.isSubmitting ? <Spinner size="sm" label="Creating account…" /> : 'Create Account'}
        </Button>

        <button
          type="button"
          onClick={onBack}
          className="w-full text-center text-cyan-600 font-semibold hover:text-cyan-700"
        >
          Back
        </button>
      </div>
    </form>
  );
}
