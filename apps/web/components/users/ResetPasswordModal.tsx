'use client';

import { useState } from 'react';
import { AlertTriangle, Check, Copy, KeyRound } from 'lucide-react';
import { apiError } from '@/lib/apiError';
import { useResetUserPasswordMutation } from '@/store/api';
import type { User } from '@/lib/types';
import { Spinner } from '@/components/ui/spinner';

// Issuing a temporary password for someone who cannot sign in.
//
// This is the whole recovery story until there is an email or SMS provider, and
// for a single clinic it is a workable one: the person is usually at the desk or
// on the phone with someone who can recognise them. What it deliberately is not
// is self-service — recovery still needs a human who can vouch for the person
// asking, which is the right default for a system holding medical records.
export function ResetPasswordModal({
  user,
  onClose,
}: {
  user: User;
  onClose: () => void;
}) {
  const [resetPassword, { isLoading }] = useResetUserPasswordMutation();
  const [temporary, setTemporary] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const run = async () => {
    setError('');
    try {
      const result = await resetPassword({ userId: user.id, body: {} }).unwrap();
      setTemporary(result.temporaryPassword);
    } catch (err) {
      setError(apiError(err, 'Could not reset the password. Please try again.'));
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(temporary);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access is blocked outside a secure context. The password is
      // on screen to be read either way, so this is not worth an error.
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-start gap-3">
          <span className="rounded-lg bg-amber-100 p-2 text-amber-600">
            <KeyRound className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-bold text-slate-900">Reset password</h2>
            <p className="text-sm text-slate-600">
              for {user.name} ({user.email})
            </p>
          </div>
        </div>

        {!temporary ? (
          <>
            <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-semibold">This signs them out everywhere.</p>
              <p>
                Every device this account is signed in on stops working
                immediately, and they will have to choose a new password before
                they can do anything else.
              </p>
              <p>
                Only do this for someone whose identity you are sure of.
              </p>
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-lg border-2 border-slate-300 px-4 py-2 font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={run}
                disabled={isLoading}
                className="inline-flex items-center justify-center gap-2 flex-1 rounded-lg bg-amber-600 px-4 py-2 font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {isLoading ? <Spinner size="sm" label="Resetting…" /> : 'Reset password'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="space-y-2 rounded-lg border border-green-200 bg-green-50 p-3">
              <p className="text-sm font-semibold text-green-900">
                Give this to {user.name.split(' ')[0]} now
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 select-all rounded border border-green-300 bg-white px-3 py-2 font-mono text-lg tracking-wide text-slate-900">
                  {temporary}
                </code>
                <button
                  type="button"
                  onClick={copy}
                  className="rounded-lg p-2 text-green-700 hover:bg-green-100"
                  aria-label="Copy password"
                >
                  {copied ? <Check className="h-5 w-5" /> : <Copy className="h-5 w-5" />}
                </button>
              </div>
              {/* Said plainly because it is true and because the alternative is
                  a support call: nothing stores this, so there is nowhere to
                  look it up. Losing it means running another reset. */}
              <p className="text-sm text-green-800">
                This is shown once and is not saved anywhere. If it is lost, run
                another reset — there is nothing to look up.
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-lg bg-gradient-to-r from-cyan-500 to-brand-teal px-4 py-2 font-semibold text-white hover:shadow-lg"
            >
              Done
            </button>
          </>
        )}
      </div>
    </div>
  );
}
