'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useFormik, FormikProvider } from 'formik';
import * as Yup from 'yup';
import { Mail, AlertCircle, CheckCircle, ArrowLeft } from 'lucide-react';
import { FormField } from '@/components/form/FormField';
import { useForgotPasswordMutation, useGetCurrentHospitalQuery } from '@/store/api';
import { currentSubdomain } from '@/lib/tenant';
import { Spinner } from '@/components/ui/spinner';

const schema = Yup.object({
  email: Yup.string().email('Please enter a valid email').required('Email is required'),
});

export default function ForgotPasswordPage() {
  const isHospitalSubdomain = !!currentSubdomain();
  const { data: hospital } = useGetCurrentHospitalQuery(undefined, { skip: !isHospitalSubdomain });
  const [forgotPassword] = useForgotPasswordMutation();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const hospitalName = hospital?.name ?? 'NetCare';

  const formik = useFormik({
    initialValues: { email: '' },
    validationSchema: schema,
    onSubmit: async (values, { setSubmitting }) => {
      setError('');
      try {
        await forgotPassword({ email: values.email }).unwrap();
        setSent(true);
      } catch (err: unknown) {
        const detail = (err as { data?: { detail?: string } })?.data?.detail;
        setError(detail ?? 'Something went wrong. Please try again.');
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
              Forgot password?
            </h2>
            <p className="text-slate-600 mt-2 text-sm">
              Enter the email on your {hospitalName} account and we&apos;ll send you a reset link.
            </p>
          </div>

          {sent ? (
            <div className="space-y-6">
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                <p className="text-green-700 text-sm">
                  Reset link sent to <strong>{formik.values.email}</strong>.
                  Check your inbox — if it doesn&apos;t appear within a minute, check your spam folder.
                </p>
              </div>
              <Link
                href="/login"
                className="flex items-center justify-center gap-2 text-cyan-600 hover:text-teal-600 font-medium text-sm"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to sign in
              </Link>
            </div>
          ) : (
            <FormikProvider value={formik}>
              <form onSubmit={formik.handleSubmit} className="space-y-4" noValidate>
                <FormField
                  name="email"
                  label="Email address"
                  type="email"
                  placeholder="your.email@example.com"
                  icon={Mail}
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
                  disabled={formik.isSubmitting}
                  className="inline-flex items-center justify-center gap-2 w-full bg-gradient-to-r from-cyan-500 to-brand-teal text-white py-2 rounded-lg font-semibold hover:shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {formik.isSubmitting ? <Spinner size="sm" label="Sending…" /> : 'Send reset link'}
                </button>

                <div className="text-center">
                  <Link
                    href="/login"
                    className="flex items-center justify-center gap-2 text-slate-500 hover:text-cyan-600 text-sm"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Back to sign in
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
