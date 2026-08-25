'use client';

import { useState } from 'react';
import { useFormik, FormikProvider } from 'formik';
import * as Yup from 'yup';
import { AlertCircle, CheckCircle, KeyRound } from 'lucide-react';
import { FormField } from '@/components/form/FormField';
import { authStorage } from '@/lib/auth';
import { apiError } from '@/lib/apiError';
import { useChangePasswordMutation } from '@/store/api';
import { Spinner } from '@/components/ui/spinner';

// The one form behind both password paths: the forced first change, and the
// voluntary one from a profile.
//
// Length is the only rule, matching the server. Composition requirements
// ("one uppercase, one digit, one symbol") reliably produce `Passw0rd!` and are
// no longer recommended by anyone measuring outcomes; the defences that do the
// work are bcrypt, login throttling and revocable sessions, all already built.
const schema = Yup.object({
  currentPassword: Yup.string().required('Enter your current password'),
  newPassword: Yup.string()
    .min(8, 'At least 8 characters')
    .required('Choose a new password')
    .notOneOf(
      [Yup.ref('currentPassword')],
      'The new password must be different from the current one',
    ),
  confirmPassword: Yup.string()
    .oneOf([Yup.ref('newPassword')], 'Passwords do not match')
    .required('Confirm your new password'),
});

interface Props {
  /** Copy and behaviour differ between the forced flow and the voluntary one. */
  forced?: boolean;
  onDone?: () => void;
}

export function ChangePasswordForm({ forced = false, onDone }: Props) {
  const [changePassword] = useChangePasswordMutation();
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const formik = useFormik({
    initialValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
    validationSchema: schema,
    onSubmit: async (values, { setSubmitting, resetForm }) => {
      setError('');
      try {
        const result = await changePassword({
          currentPassword: values.currentPassword,
          newPassword: values.newPassword,
        }).unwrap();

        // The response carries a fresh access token for this device — every
        // *other* session was just ended server-side, so keeping the old one
        // would sign the user out of the act of securing themselves.
        const session = authStorage.getSession();
        if (session) {
          authStorage.setSession({
            ...session,
            token: result.token,
            refreshToken: result.refreshToken ?? session.refreshToken,
            mustChangePassword: false,
          });
        }
        resetForm();
        setDone(true);
        onDone?.();
      } catch (err) {
        setError(apiError(err, 'Could not change your password. Please try again.'));
      } finally {
        setSubmitting(false);
      }
    },
  });

  if (done && !forced) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 p-4">
        <CheckCircle className="h-5 w-5 shrink-0 text-green-600 mt-0.5" />
        <div className="text-sm">
          <p className="font-semibold text-green-900">Password changed</p>
          <p className="text-green-800">
            You are still signed in here. Any other device you were signed in on
            has been signed out.
          </p>
          <button
            type="button"
            onClick={() => setDone(false)}
            className="mt-2 font-semibold text-cyan-600 hover:text-cyan-700"
          >
            Change it again
          </button>
        </div>
      </div>
    );
  }

  return (
    <FormikProvider value={formik}>
      <form onSubmit={formik.handleSubmit} className="space-y-4" noValidate>
        {forced && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <KeyRound className="h-5 w-5 shrink-0 text-amber-600 mt-0.5" />
            <p className="text-sm text-amber-900">
              This password was set for you by someone else, so it is a way in
              and nothing more. Choose your own before continuing — until you
              do, anything done with this account could have been done by
              whoever handed you the password.
            </p>
          </div>
        )}

        <FormField
          name="currentPassword"
          label={forced ? 'The password you were given' : 'Current password'}
          type="password"
          autoComplete="current-password"
        />
        <FormField
          name="newPassword"
          label="New password"
          type="password"
          autoComplete="new-password"
        />
        <FormField
          name="confirmPassword"
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
        />

        <p className="text-xs text-slate-500">
          At least 8 characters. A short phrase you will remember beats a short
          one you will not.
        </p>

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={formik.isSubmitting}
          className="inline-flex items-center justify-center gap-2 w-full rounded-lg bg-gradient-to-r from-cyan-500 to-brand-teal py-2 font-semibold text-white transition hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
        >
          {formik.isSubmitting ? <Spinner size="sm" label="Saving…" /> : 'Change password'}
        </button>
      </form>
    </FormikProvider>
  );
}
