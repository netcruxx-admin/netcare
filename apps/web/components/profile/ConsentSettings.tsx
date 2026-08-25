'use client';

import { ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  useCreateConsentMutation,
  useListConsentPurposesQuery,
  useListConsentsQuery,
  useWithdrawConsentMutation,
} from '@/store/api';
import { apiError } from '@/lib/apiError';
import { fmtDate } from '@/lib/date';
import { ageFromDateOfBirth, AGE_OF_MAJORITY } from '@/app/register/registrationSchemas';
import { Spinner } from '@/components/ui/spinner';
import { toast } from 'sonner';

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
  const [saving, setSaving] = useState(false);

  // Local draft of which optional consents are ticked.
  const [draft, setDraft] = useState<Record<string, boolean>>({});
  const [draftReady, setDraftReady] = useState(false);

  const existingGuardian = consents.find((c) => c.guardianName);
  const [guardianName, setGuardianName] = useState('');
  const [guardianRelationship, setGuardianRelationship] = useState('');
  const [prefilled, setPrefilled] = useState(false);

  const age = ageFromDateOfBirth(dateOfBirth ?? '');
  const isMinor = age !== null && age < AGE_OF_MAJORITY;

  const standing = purposes.filter((p) => p.cadence === 'per_person');
  const live = new Map(consents.map((c) => [c.purposeCode, c]));

  // Initialise draft from live consents once they load.
  useEffect(() => {
    if (loadingConsents || loadingPurposes) return;
    const initial: Record<string, boolean> = {};
    standing.forEach((p) => { initial[p.code] = Boolean(live.get(p.code)); });
    setDraft(initial);
    setDraftReady(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingConsents, loadingPurposes]);

  if (!prefilled && consents.length > 0) {
    if (existingGuardian) {
      setGuardianName(existingGuardian.guardianName ?? '');
      setGuardianRelationship(existingGuardian.guardianRelationship ?? '');
    }
    setPrefilled(true);
  }

  const missingRequired = standing.filter((p) => p.required && !live.get(p.code));

  // Whether draft differs from what's saved.
  const hasChanges = draftReady && standing.some((p) => {
    const savedOn = Boolean(live.get(p.code));
    return draft[p.code] !== savedOn;
  });

  const handleSave = async () => {
    setError('');

    if (isMinor && !guardianName.trim()) {
      setError('Please enter the guardian name before granting consent for a minor.');
      return;
    }

    setSaving(true);
    try {
      for (const p of standing) {
        const savedOn = Boolean(live.get(p.code));
        const draftOn = Boolean(draft[p.code]);
        if (draftOn === savedOn) continue;

        if (draftOn) {
          await createConsent({
            purposeCode: p.code,
            guardianName: isMinor ? guardianName.trim() : undefined,
            guardianRelationship: isMinor ? guardianRelationship.trim() : undefined,
          }).unwrap();
        } else {
          await withdrawConsent({ purposeCode: p.code }).unwrap();
        }
      }
      toast.success('Consent preferences saved');
    } catch (err) {
      setError(apiError(err, 'Could not save your consent preferences. Please try again.'));
    } finally {
      setSaving(false);
    }
  };

  if (loadingPurposes || loadingConsents) {
    return (
      <div className="flex items-center gap-2 py-6 text-slate-500">
        <Spinner label="Loading your consents…" />
      </div>
    );
  }

  const busy = granting || withdrawing || saving;

  return (
    <div id="consent-section" className="bg-white dark:bg-slate-900 rounded-lg shadow p-6 space-y-4">
      <div className="flex items-start gap-2">
        <ShieldCheck className="h-5 w-5 shrink-0 text-cyan-600 mt-0.5" />
        <div>
          <h2 className="font-bold text-lg text-slate-900 dark:text-slate-100">
            Privacy &amp; consent
          </h2>
          <p className="text-sm text-slate-500">
            What you have agreed to let us do with your information. Turning off
            an optional consent never affects your care.
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
          const on = Boolean(draft[p.code]);
          const savedOn = Boolean(consent);
          const changed = on !== savedOn;

          return (
            <label
              key={p.code}
              className={`flex gap-3 items-start p-3 rounded-lg border transition ${
                changed ? 'border-cyan-300 bg-cyan-50/40' : 'border-slate-200 dark:border-slate-700'
              } ${
                (p.required && savedOn) || busy ? 'cursor-default' : 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <input
                type="checkbox"
                checked={on}
                disabled={(p.required && savedOn) || busy}
                onChange={() => {
                  if (p.required && savedOn) return;
                  setDraft((d) => ({ ...d, [p.code]: !d[p.code] }));
                }}
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

      <div className="flex justify-end pt-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={!hasChanges || busy}
          className="px-6 py-2 bg-gradient-to-r from-cyan-500 to-brand-teal text-white rounded-lg font-semibold hover:shadow-lg transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {saving ? <Spinner size="sm" label="Saving…" /> : 'Save Preferences'}
        </button>
      </div>
    </div>
  );
}
