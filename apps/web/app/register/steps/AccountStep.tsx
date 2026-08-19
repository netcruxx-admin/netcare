'use client';

import type { FormikProps } from 'formik';
import { Lock, Mail, User } from 'lucide-react';
import { FormField } from '@/components/form/FormField';
import { PhoneField } from '@/components/form/PhoneField';
import type { FormValues } from '../registrationSchemas';

interface AccountStepProps {
  formik: FormikProps<FormValues>;
  needsDetails: boolean;
  hasVerify: boolean;
  onBack: () => void;
}

// Account credentials step (all roles). "Continue" submits — the wizard hook
// decides whether that advances to details or creates the account outright.
export function AccountStep({ formik, needsDetails, hasVerify, onBack }: AccountStepProps) {
  return (
    <form onSubmit={formik.handleSubmit} className="space-y-4" noValidate>
      <FormField name="name" label="Full Name" placeholder="John Doe" icon={User} required />
      {/* new-password / off tokens stop Chrome from injecting saved login
          credentials into this signup form. */}
      <FormField name="email" label="Email" type="email" placeholder="your.email@example.com" icon={Mail} autoComplete="off" required />
      <PhoneField name="phone" label="Phone Number" required />
      <FormField name="password" label="Password" type="password" placeholder="••••••••" icon={Lock} autoComplete="new-password" required />
      <FormField name="confirmPassword" label="Confirm Password" type="password" placeholder="••••••••" icon={Lock} autoComplete="new-password" required />

      <button
        type="submit"
        disabled={formik.isSubmitting}
        className="w-full bg-gradient-to-r from-cyan-500 to-brand-teal text-white py-2 rounded-lg font-semibold hover:shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {formik.isSubmitting ? 'Please wait...' : needsDetails ? 'Continue' : 'Create Account'}
      </button>

      <button
        type="button"
        onClick={onBack}
        className="w-full text-center text-cyan-600 font-semibold hover:text-cyan-700"
      >
        {hasVerify ? 'Back' : 'Back to Role Selection'}
      </button>
    </form>
  );
}
