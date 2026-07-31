'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useFormik, FormikProvider } from 'formik';
import * as Yup from 'yup';
import { Heart, Mail, Lock, AlertCircle } from 'lucide-react';
import { authStorage } from '@/lib/auth';
import { loginRoleTabs, resolveHomePath } from '@/lib/roles';
import { FormField } from '@/components/form/FormField';
import { useGetCurrentHospitalQuery, useLoginMutation } from '@/store/api';

type LoginType = (typeof loginRoleTabs)[number];


const loginSchema = Yup.object({
  email: Yup.string().email('Please enter a valid email').required('Email is required'),
  password: Yup.string().required('Password is required'),
});

export default function LoginPage() {
  const router = useRouter();
  const { data: hospital } = useGetCurrentHospitalQuery();
  const [loginMutation, { isLoading }] = useLoginMutation();
  const [error, setError] = useState('');
  const [loginType, setLoginType] = useState<LoginType>('patient');

  const hospitalName = hospital?.name ?? 'NetCare';

  const formik = useFormik({
    initialValues: { email: '', password: '' },
    validationSchema: loginSchema,
    onSubmit: async (values, { setSubmitting }) => {
      setError('');
      try {
        const result = await loginMutation({
          email: values.email,
          password: values.password,
        }).unwrap();

        const role = result.user.role;
        // The tabs only cover roles that have their own login surface. A
        // superadmin, or anyone holding a role added to the catalog at runtime,
        // must not be rejected for "not matching" a tab that can't represent
        // them — only enforce the match when the tab could have been picked.
        const isTabRole = (loginRoleTabs).includes(role);
        if (isTabRole && role !== loginType) {
          setError(`This account is not a ${loginType} account`);
          return;
        }

        authStorage.setSession({
          user: result.user,
          patient: result.patient,
          hospitalId: result.user.hospitalId ?? '',
          role: result.role,
          token: result.token,
          isAuthenticated: true,
        });

        // The role itself declares where it lands, so a new role needs no code
        // change here (see lib/roles.ts).
        router.push(resolveHomePath(role, result.role?.homePath));
      } catch (err: unknown) {
        const detail = (err as { data?: { detail?: string } })?.data?.detail;
        setError(detail ?? 'Invalid email or password');
      } finally {
        setSubmitting(false);
      }
    },
  });

  const handleTypeSelect = (type: LoginType) => {
    setLoginType(type);
    setError('');
    formik.setTouched({});
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-cyan-50 via-white to-teal-50 flex flex-col">
      {/* Header */}
      <div className="bg-white shadow-md border-b-2 border-cyan-100">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-cyan-500 to-teal-600 rounded-lg flex items-center justify-center">
            <Heart className="w-6 h-6 text-white" />
          </div>
          <Link href="/" className="text-2xl font-bold bg-gradient-to-r from-cyan-600 to-teal-600 bg-clip-text text-transparent hover:opacity-80">
            {hospitalName}
          </Link>
        </div>
      </div>

      {/* Login Form */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8 space-y-8 border border-cyan-100">
          <div className="text-center">
            <h2 className="text-3xl font-bold bg-gradient-to-r from-cyan-600 to-teal-600 bg-clip-text text-transparent">Sign In</h2>
            <p className="text-slate-600 mt-2">Access your {hospitalName} account</p>
          </div>

          {/* Login Type Selector */}
          <div className="space-y-3">
            <label className="block text-sm font-medium text-slate-700">Login As</label>
            <div className="grid grid-cols-3 gap-2">
              {loginRoleTabs.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => handleTypeSelect(type)}
                  className={`py-2 px-4 rounded-lg font-medium transition capitalize ${
                    loginType === type
                      ? 'bg-gradient-to-r from-cyan-500 to-teal-600 text-white shadow-lg'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}


          <FormikProvider value={formik}>
            <form onSubmit={formik.handleSubmit} className="space-y-4" noValidate>
              <FormField name="email" label="Email" type="email" placeholder="your.email@example.com" icon={Mail} required />
              <FormField name="password" label="Password" type="password" placeholder="••••••••" icon={Lock} required />

              <button
                type="submit"
                disabled={isLoading || formik.isSubmitting}
                className="w-full bg-gradient-to-r from-cyan-500 to-teal-600 text-white py-2 rounded-lg font-semibold hover:shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading || formik.isSubmitting ? 'Signing in...' : 'Sign In'}
              </button>
            </form>
          </FormikProvider>

          <div className="text-center">
            <p className="text-slate-600 text-sm">
              Don&apos;t have an account?{' '}
              <Link href="/register" className="text-cyan-600 font-semibold hover:text-teal-600">
                Create one
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
