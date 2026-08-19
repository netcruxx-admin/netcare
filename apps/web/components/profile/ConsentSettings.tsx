'use client';

import { Loader2, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import {
  useCreateConsentMutation,
  useListConsentPurposesQuery,
  useListConsentsQuery,
  useWithdrawConsentMutation,
} from '@/store/api';
import { apiError } from '@/lib/apiError';
import { fmtDate } from '@/lib/date';
import { ageFromDateOfBirth, AGE_OF_MAJORITY } from '@/app/register/registrationSchemas';

// What you have agreed to, and the switch to take it back.
//
// This panel is the reason the sign-up form's promise ("you can withdraw any
// optional consent later") is true. DPDP requires withdrawal to be as easy as
// granting was, which rules out asking staff or sending an email — a signed-in
// person flips the switch here and it takes effect on the next request, because
// the backend resolves consent per request rather than caching it in the token.
//
// Required purposes are shown but not switchable: withdrawing consent to be
// treated is a request to close the account, not a toggle, and the backend
// refuses it for the same reason.
interface Props {
  dateOfBirth?: string;
}

export function ConsentSettings({ dateOfBirth }: Props) {
  const { data: purposes = [], isLoading: loadingPurposes } =
    useListConsentPurposesQuery();
  const { data: consents = [], isLoading: loadingConsents } = useListConsentsQuery();
  const [createConsent, { isLoading: granting }] = useCreateConsentMutation();
  const [withdrawConsent, { isLoading: withdrawing }] = useWithdrawConsentMutation();
  const [error, setError] = useState('');

  // Prefill from the most recent consent that recorded a guardian — covers patients
  // who registered via /register (guardian info is on their consent rows) and avoids
  // asking the same parent to re-type their name every time.
  const existingGuardian = consents.find((c) => c.guardianName);
  const [guardianName, setGuardianName] = useState('');
  const [guardianRelationship, setGuardianRelationship] = useState('');

  // Sync once consents arrive (they load async after mount).
  const [prefilled, setPrefilled] = useState(false);
  if (!prefilled && consents.length > 0) {
    if (existingGuardian) {
      setGuardianName(existingGuardian.guardianName ?? '');
      setGuardianRelationship(existingGuardian.guardianRelationship ?? '');
    }
    setPrefilled(true);
  }

  const age = ageFromDateOfBirth(dateOfBirth ?? '');
  const isMinor = age !== null && age < AGE_OF_MAJORITY;

  const busy = granting || withdrawing;
  // Per-event purposes are answered at the consultation, not here, so showing a
  // standing switch for one would misrepresent how it actually works.
  const standing = purposes.filter((p) => p.cadence === 'per_person');
  const live = new Map(consents.map((c) => [c.purposeCode, c]));

  const missingRequired = standing.filter((p) => p.required && !live.get(p.code));

  const toggle = async (code: string, on: boolean) => {
    setError('');
    if (on && isMinor && !guardianName.trim()) {
      setError('Please enter the guardian name before granting consent for a minor.');
      return;
    }
    try {
      if (on) {
        await createConsent({
          purposeCode: code,
          guardianName: isMinor ? guardianName.trim() : undefined,
          guardianRelationship: isMinor ? guardianRelationship.trim() : undefined,
        }).unwrap();
      } else {
        await withdrawConsent({ purposeCode: code }).unwrap();
      }
    } catch (err) {
      setError(apiError(err, 'Could not update your consent. Please try again.'));
    }
  };

  if (loadingPurposes || loadingConsents) {
    return (
      <div className="flex items-center gap-2 py-6 text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading your consents…
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-lg shadow-lg p-6 space-y-4">
      <div className="flex items-start gap-2">
        <ShieldCheck className="h-5 w-5 shrink-0 text-cyan-600 mt-0.5" />
        <div>
          <h2 className="font-bold text-lg text-slate-900 dark:text-slate-100">
            Privacy &amp; consent
          </h2>
          <p className="text-sm text-slate-500">
            What you have agreed to let us do with your information. Turning off
            an optional consent never affects your care. Changes save automatically.
          </p>
        </div>
      </div>

      {missingRequired.length > 0 && (
        <div className="rounded-lg bg-amber-50 border border-amber-300 p-3 text-sm text-amber-800">
          <span className="font-semibold">Action required:</span> Please tick the required consents
          below to activate your account. These are needed to provide your care.
        </div>
      )}

      {isMinor && standing.some((p) => !live.get(p.code)) && (
        <div className="rounded-lg bg-blue-50 border border-blue-200 p-4 space-y-3">
          <p className="text-sm font-semibold text-blue-800">
            This patient is under 18 — a parent or lawful guardian must consent on their behalf (DPDP s.9).
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-blue-900 mb-1">
                Guardian Full Name <span className="text-red-500">*</span>
              </label>
              <input
                value={guardianName}
                onChange={(e) => setGuardianName(e.target.value)}
                placeholder="e.g. Ramesh Kumar"
                className="w-full border border-blue-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-blue-900 mb-1">Relationship</label>
              <input
                value={guardianRelationship}
                onChange={(e) => setGuardianRelationship(e.target.value)}
                placeholder="e.g. Father"
                className="w-full border border-blue-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="space-y-2">
        {standing.map((p) => {
          const consent = live.get(p.code);
          const on = Boolean(consent);
          return (
            <label
              key={p.code}
              className={`flex gap-3 items-start p-3 rounded-lg border border-slate-200 dark:border-slate-700 ${
                (p.required && on) || busy ? 'cursor-default' : 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <input
                type="checkbox"
                checked={on}
                disabled={(p.required && on) || busy}
                onChange={() => toggle(p.code, !on)}
                className="mt-1 h-4 w-4 shrink-0 accent-cyan-600 disabled:opacity-50"
              />
              <div className="text-sm">
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  {p.label}
                </span>
                {p.required ? (
                  <span className="ml-2 text-xs text-slate-500">
                    Required for your care — cannot be turned off
                  </span>
                ) : null}
                {consent?.stale && (
                  <span className="ml-2 text-xs font-medium text-amber-600">
                    We have updated this notice — please read it again
                  </span>
                )}
                <p className="mt-1 text-slate-600 dark:text-slate-400 leading-relaxed">
                  {p.notice}
                </p>
                {consent && (
                  <p className="mt-1 text-xs text-slate-400">
                    Agreed {fmtDate(consent.grantedAt)}
                    {consent.guardianName
                      ? ` by ${consent.guardianName}${
                          consent.guardianRelationship
                            ? ` (${consent.guardianRelationship})`
                            : ''
                        }`
                      : ''}
                  </p>
                )}
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}
