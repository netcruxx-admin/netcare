'use client';

import type { FormikProps } from 'formik';
import { AlertCircle, Loader2, Search, ShieldCheck } from 'lucide-react';
import { FormField } from '@/components/form/FormField';
import type { FormValues, VerifyConfig } from '../registrationSchemas';

type LookupState = 'idle' | 'loading' | 'found' | 'notfound';
type Verified = { status?: string; rows: [string, string][] } | null;

interface VerifyStepProps {
  formik: FormikProps<FormValues>;
  verifyConfig: VerifyConfig;
  lookupState: LookupState;
  verified: Verified;
  onFetch: () => void;
  onBack: () => void;
}

// "Verify & auto-fill" step for patient (Aadhaar) / doctor & nurse (registration).
export function VerifyStep({ formik, verifyConfig, lookupState, verified, onFetch, onBack }: VerifyStepProps) {
  return (
    <form onSubmit={formik.handleSubmit} className="space-y-4" noValidate>
      <p className="text-sm text-slate-500">{verifyConfig.intro}</p>

      <FormField
        name={verifyConfig.field}
        label={verifyConfig.label}
        placeholder={verifyConfig.placeholder}
        icon={verifyConfig.icon}
        required
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onFetch}
          disabled={lookupState === 'loading'}
          className="inline-flex items-center gap-2 rounded-lg border border-cyan-300 bg-white px-3 py-1.5 text-sm font-semibold text-cyan-700 transition hover:bg-cyan-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {lookupState === 'loading' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          {lookupState === 'loading' ? 'Verifying…' : 'Fetch details'}
        </button>
        <span className="text-xs text-slate-400">Try: {verifyConfig.samples.slice(0, 2).join(', ')}</span>
      </div>

      {lookupState === 'found' && verified && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 space-y-3">
          <div className="flex items-center gap-2 text-green-800">
            <ShieldCheck className="h-5 w-5 flex-shrink-0" />
            <span className="font-semibold">{verifyConfig.verifiedTitle}</span>
            {verified.status && (
              <span className="ml-auto rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium capitalize text-green-700">
                {verified.status}
              </span>
            )}
          </div>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {verified.rows.map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-green-700">{k}</dt>
                <dd className="font-medium text-green-900">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-green-700">
            We&apos;ve pre-filled these — you can review and edit them on the next steps.
          </p>
        </div>
      )}
      {lookupState === 'notfound' && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
          <p className="text-sm text-amber-800">
            No match found for this number. Double-check it, or continue and enter your details manually.
          </p>
        </div>
      )}

      <button
        type="submit"
        disabled={formik.isSubmitting}
        className="w-full bg-gradient-to-r from-cyan-500 to-brand-teal text-white py-2 rounded-lg font-semibold hover:shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Continue
      </button>

      <button type="button" onClick={onBack} className="w-full text-center text-cyan-600 font-semibold hover:text-cyan-700">
        Back to Role Selection
      </button>
    </form>
  );
}
