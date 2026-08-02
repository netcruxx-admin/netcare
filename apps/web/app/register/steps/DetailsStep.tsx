'use client';

import type { FormikProps } from 'formik';
import { BadgeCheck, Calendar, Droplet, Info, ShieldCheck, Stethoscope } from 'lucide-react';
import { FormField } from '@/components/form/FormField';
import type { Department } from '@/lib/types';
import { BLOOD_GROUPS, CURRENT_YEAR, FormValues, GENDERS, MEDICAL_COUNCILS, Role } from '../registrationSchemas';

interface DetailsStepProps {
  formik: FormikProps<FormValues>;
  userType: Role | null;
  departments: Department[];
  onBack: () => void;
}

// Final role-specific details step (patient health info / doctor credentials).
export function DetailsStep({ formik, userType, departments, onBack }: DetailsStepProps) {
  const genderOptions = GENDERS.map((g) => ({ value: g, label: g }));
  const bloodGroupOptions = BLOOD_GROUPS.map((b) => ({ value: b, label: b }));
  const councilOptions = MEDICAL_COUNCILS.map((c) => ({ value: c, label: c }));
  const specializationOptions = departments.map((d) => ({ value: d.name, label: d.name }));

  return (
    <form onSubmit={formik.handleSubmit} className="space-y-4" noValidate>
      {userType === 'patient' ? (
        <>
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
        </>
      ) : (
        <>
          <div className="bg-cyan-50 border border-cyan-200 rounded-lg p-3 flex items-start gap-2">
            <Info className="w-5 h-5 text-cyan-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-cyan-800">
              We verify your registration number with the medical council. Your account stays in{' '}
              <span className="font-semibold">pending verification</span> until an administrator approves it.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <FormField name="licenseNumber" label="Medical Registration / License Number" placeholder="e.g. MH-2012-045678" icon={BadgeCheck} required />
            </div>
            <FormField name="medicalCouncil" label="Issuing Medical Council" as="select" placeholder="Select…" options={councilOptions} />
            <FormField name="registrationYear" label="Year of Registration" type="number" placeholder="e.g. 2015" min="1950" max={String(CURRENT_YEAR)} />
            <div className="sm:col-span-2">
              <FormField name="qualification" label="Qualification" placeholder="e.g. MBBS, MD (Obstetrics & Gynecology)" icon={Stethoscope} required />
            </div>
            <FormField name="specialization" label="Specialization" as="select" placeholder="Select…" options={specializationOptions} required />
            <FormField name="experienceYears" label="Years of Experience" type="number" placeholder="e.g. 10" min="0" max="60" />
            <div className="sm:col-span-2">
              <FormField name="consultationFee" label="Consultation Fee (₹)" type="number" placeholder="e.g. 700" min="0" />
            </div>
          </div>
        </>
      )}

      <button
        type="submit"
        disabled={formik.isSubmitting}
        className="w-full bg-gradient-to-r from-cyan-500 to-brand-teal text-white py-2 rounded-lg font-semibold hover:shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {userType === 'doctor' && <ShieldCheck className="w-5 h-5" />}
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
