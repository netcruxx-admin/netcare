'use client';

import type { FormikProps } from 'formik';
import { AlertCircle, ShieldCheck } from 'lucide-react';
import { useListConsentPurposesQuery } from '@/store/api';
import { FormField } from '@/components/form/FormField';
import { FormValues } from '../registrationSchemas';
import { Spinner } from '@/components/ui/spinner';

interface ConsentStepProps {
  formik: FormikProps<FormValues>;
  onBack: () => void;
  /** True when the date of birth entered on the previous step is under 18. */
  isMinor: boolean;
  /** Server or pre-flight error to show inline near the submit button. */
  inlineError?: string;
}

// The notice, and the ticks that answer it (DPDP 2023).
//
// The wording is fetched, never hardcoded here: what a person agreed to has to
// be reproducible years later, and a string in this bundle would silently
// change on the next deploy. The backend versions each purpose and stamps that
// version onto the consent row, so this component only has to render what the
// API sends and report back which codes were ticked.
//
// Required and optional purposes are visually separated and the optional ones
// start unticked. That is not styling: DPDP requires consent to be specific and
// unconditional, so bundling "treatment" and "marketing" behind one pre-ticked
// box would make every consent collected here invalid.
export function ConsentStep({ formik, onBack, isMinor, inlineError }: ConsentStepProps) {
  const { data: purposes = [], isLoading, isError } = useListConsentPurposesQuery();

  // Per-event purposes (a video consultation) are asked when the event happens,
  // not settled here, so the sign-up form does not show them at all.
  const standing = purposes.filter((p) => p.cadence === 'per_person');
  const required = standing.filter((p) => p.required);
  const optional = standing.filter((p) => !p.required);

  const selected = formik.values.consents;
  const allRequiredTicked = required.every((p) => selected.includes(p.code));

  const toggle = (code: string) => {
    formik.setFieldValue(
      'consents',
      selected.includes(code)
        ? selected.filter((c) => c !== code)
        : [...selected, code],
    );
  };

  const row = (
    p: { code: string; label: string; notice: string },
    tone: 'required' | 'optional',
  ) => (
    <label
      key={p.code}
      className="flex gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-cyan-400 cursor-pointer transition"
    >
      <input
        type="checkbox"
        checked={selected.includes(p.code)}
        onChange={() => toggle(p.code)}
        className="mt-1 h-4 w-4 shrink-0 accent-cyan-600"
      />
      <span className="text-sm">
        <span className="font-semibold text-slate-900 dark:text-slate-100">
          {p.label}
        </span>
        {tone === 'required' ? (
          <span className="ml-2 text-xs font-medium text-slate-500">Required</span>
        ) : (
          <span className="ml-2 text-xs font-medium text-cyan-600">Optional</span>
        )}
        <span className="block mt-1 text-slate-600 dark:text-slate-400 leading-relaxed">
          {p.notice}
        </span>
      </span>
    </label>
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-slate-500">
        <Spinner label="Loading the privacy notice…" />
      </div>
    );
  }

  if (isError) {
    // Deliberately a dead end rather than a "continue anyway": an account
    // created without the notice having been shown has no lawful basis behind
    // it, so failing to load it has to block the sign-up.
    return (
      <div className="space-y-4">
        <p className="text-sm text-red-600">
          We could not load the privacy notice, so we cannot create an account
          right now. Please try again in a moment.
        </p>
        <button
          type="button"
          onClick={onBack}
          className="w-full text-center text-cyan-600 font-semibold hover:text-cyan-700"
        >
          Back
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={formik.handleSubmit} className="space-y-4" noValidate>
      <div className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-400">
        <ShieldCheck className="h-5 w-5 shrink-0 text-cyan-600" />
        <p>
          How we will use your information. You can withdraw any optional
          consent later from your profile, at any time, without affecting your
          care.
        </p>
      </div>

      <div className="space-y-2">{required.map((p) => row(p, 'required'))}</div>

      {optional.length > 0 && (
        <>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 pt-2">
            Optional — your care is the same either way
          </p>
          <div className="space-y-2">{optional.map((p) => row(p, 'optional'))}</div>
        </>
      )}

      {isMinor && (
        <div className="space-y-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900">
          {/* DPDP s.9: a data principal under 18 needs a parent or lawful
              guardian to consent, and the guardian has to be identified on the
              record. The backend refuses the sign-up without this, so asking
              here is what keeps that refusal from being a dead end. */}
          <p className="text-sm text-amber-900 dark:text-amber-200">
            This patient is under 18, so a parent or lawful guardian must give
            these consents.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField name="guardianName" label="Parent / Guardian Name" placeholder="Full name" />
            <FormField
              name="guardianRelationship"
              label="Relationship"
              placeholder="e.g. Mother, Father, Legal guardian"
            />
          </div>
        </div>
      )}

      {inlineError && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{inlineError}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={formik.isSubmitting || !allRequiredTicked}
        className="w-full bg-gradient-to-r from-cyan-500 to-brand-teal text-white py-2 rounded-lg font-semibold hover:shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {formik.isSubmitting ? <Spinner size="sm" label="Creating account…" /> : 'Agree & Create Account'}
      </button>

      {!allRequiredTicked && (
        <p className="text-xs text-center text-slate-500">
          The required consents above are what let us treat you and bill for it.
          Without them we cannot open an account.
        </p>
      )}

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
