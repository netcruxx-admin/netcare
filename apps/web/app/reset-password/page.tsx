'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useFormik, FormikProvider } from 'formik';
import * as Yup from 'yup';
import { Lock, AlertCircle, CheckCircle } from 'lucide-react';
import { FormField } from '@/components/form/FormField';
import { useResetPasswordMutation, useGetCurrentHospitalQuery } from '@/store/api';
import { currentSubdomain } from '@/lib/tenant';

const schema = Yup.object({
  newPassword: Yup.string()
    .min(8, 'Password must be at least 8 characters')
    .required('New password is required'),
  confirmPassword: Yup.string()
    .oneOf([Yup.ref('newPassword')], 'Passwords do not match')
    .required('Please confirm your password'),
});

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const isHospitalSubdomain = !!currentSubdomain();
  const { data: hospital } = useGetCurrentHospitalQuery(undefined, { skip: !isHospitalSubdomain });
  const [resetPassword] = useResetPasswordMutation();
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const hospitalName = hospital?.name ?? 'NetCare';

  const formik = useFormik({
    initialValues: { newPassword: '', confirmPassword: '' },
    validationSchema: schema,
    onSubmit: async (values, { setSubmitting }) => {
      setError('');
      if (!token) {
        setError('Reset link is missing or malformed. Please request a new one.');
        setSubmitting(false);
        return;
      }
      try {
        await resetPassword({ token, newPassword: values.newPassword }).unwrap();
        setDone(true);
        // Redirect to login after a short pause so the user can read the success banner.
        setTimeout(() => router.push('/login?reset=1'), 2500);
      } catch (err: unknown) {
        const detail = (err as { data?: { detail?: string } })?.data?.detail;
        setError(detail ?? 'This reset link is invalid or has expired. Please request a new one.');
      } finally {
        setSubmitting(false);
      }
    },
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-cyan-50 via-white to-teal-50 flex flex-col">
      {/* Header */}
      <div className="bg-white shadow-md border-b-2 border-cyan-100">
        <div className="max-w-6xl mx-auto px-6 py-2 flex items-center gap-3">
          <Link href="/login" className="hover:opacity-80 transition">
            {hospital?.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={hospital.logoUrl} alt={hospitalName} className="w-20 h-20 object-contain" />
            ) : (
              <Image src="/logo/logo-full.png" alt={hospitalName} width={80} height={80} className="w-20 h-20 object-contain" />
            )}
          </Link>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8 space-y-6 border border-cyan-100">
          <div className="text-center">
            <h2 className="text-3xl font-bold bg-gradient-to-r from-cyan-600 to-brand-teal bg-clip-text text-transparent">
              Set new password
            </h2>
            <p className="text-slate-600 mt-2 text-sm">
              Choose a strong password for your {hospitalName} account.
            </p>
          </div>

          {done ? (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                <p className="text-green-700 text-sm">
                  Password updated! Redirecting you to sign in…
                </p>
              </div>
            </div>
          ) : (
            <FormikProvider value={formik}>
              <form onSubmit={formik.handleSubmit} className="space-y-4" noValidate>
                {!token && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-center gap-2.5">
                    <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                    <p className="text-amber-700 text-sm">
                      Reset link is missing.{' '}
                      <Link href="/forgot-password" className="underline font-medium">
                        Request a new one.
                      </Link>
                    </p>
                  </div>
                )}

                <FormField
                  name="newPassword"
                  label="New password"
                  type="password"
                  placeholder="At least 8 characters"
                  icon={Lock}
                  required
                />
                <FormField
                  name="confirmPassword"
                  label="Confirm new password"
                  type="password"
                  placeholder="Repeat your new password"
                  icon={Lock}
                  required
                />

                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-center gap-2.5">
                    <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                    <p className="text-red-700 text-sm">{error}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={formik.isSubmitting || !token}
                  className="w-full bg-gradient-to-r from-cyan-500 to-brand-teal text-white py-2 rounded-lg font-semibold hover:shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {formik.isSubmitting ? 'Saving…' : 'Set new password'}
                </button>

                <div className="text-center">
                  <Link href="/forgot-password" className="text-slate-500 hover:text-cyan-600 text-sm">
                    Request a new reset link
                  </Link>
                </div>
              </form>
            </FormikProvider>
          )}
        </div>
      </div>
    </div>
  );
}

function ResetPasswordFallback() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-cyan-50 via-white to-teal-50 flex flex-col">
      <div className="bg-white shadow-md border-b-2 border-cyan-100">
        <div className="max-w-6xl mx-auto px-6 py-2">
          <Image src="/logo/logo-full.png" alt="NetCare" width={80} height={80} className="w-20 h-20 object-contain" />
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8 border border-cyan-100">
          <div className="text-center">
            <h2 className="text-3xl font-bold bg-gradient-to-r from-cyan-600 to-brand-teal bg-clip-text text-transparent">
              Set new password
            </h2>
            <p className="text-slate-600 mt-2">Loading…</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// useSearchParams requires a Suspense boundary (same pattern as login/page.tsx).
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<ResetPasswordFallback />}>
      <ResetPasswordForm />
    </Suspense>
  );
}
