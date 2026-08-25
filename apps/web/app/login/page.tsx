'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useFormik, FormikProvider } from 'formik';
import * as Yup from 'yup';
import { Mail, Lock, AlertCircle, CheckCircle, KeyRound } from 'lucide-react';
import Image from 'next/image';
import { authStorage } from '@/lib/auth';
import { loginRoleTabs, resolveHomePath } from '@/lib/roles';
import { FormField } from '@/components/form/FormField';
import { useGetCurrentHospitalQuery, useLoginMutation } from '@/store/api';
import { currentSubdomain } from '@/lib/tenant';

type LoginType = (typeof loginRoleTabs)[number];

const loginSchema = Yup.object({
  email: Yup.string().email('Please enter a valid email').required('Email is required'),
  password: Yup.string().required('Password is required'),
});

/** The page's own frame, shown for the instant before the client subtree
 *  hydrates. Matching the real layout rather than showing a spinner keeps the
 *  header and card from jumping into place under the user. */
function LoginFallback() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-cyan-50 via-white to-teal-50 flex flex-col">
      <div className="bg-white shadow-md border-b-2 border-cyan-100">
        <div className="max-w-6xl mx-auto px-6 py-2 flex items-center gap-3">
          <Image src="/logo/logo-full.png" alt="NetCare" width={80} height={80} className="w-20 h-20 object-contain" />
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8 space-y-8 border border-cyan-100">
          <div className="text-center">
            <h2 className="text-3xl font-bold bg-gradient-to-r from-cyan-600 to-brand-teal bg-clip-text text-transparent">Sign In</h2>
            <p className="text-slate-600 mt-2">Loading…</p>
          </div>
        </div>
      </div>
    </div>
  );
}


function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const justRegistered = searchParams.get('registered') === '1';
  const justReset = searchParams.get('reset') === '1';
  const isHospitalSubdomain = !!currentSubdomain();
  const { data: hospital } = useGetCurrentHospitalQuery(undefined, { skip: !isHospitalSubdomain });
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

        // Root domain is the superadmin portal — no hospital staff belongs here.
        if (!isHospitalSubdomain && role !== 'superadmin') {
          setError('This portal is for platform administrators only. Please log in at your hospital\'s subdomain.');
          return;
        }

        // On a hospital subdomain, enforce that the selected tab matches the
        // account's role so a patient can't accidentally log in as a doctor tab.
        if (isHospitalSubdomain) {
          const isTabRole = loginRoleTabs.includes(role as LoginType);
          if (isTabRole && role !== loginType) {
            setError(`This account is not a ${loginType} account`);
            return;
          }
        }

        authStorage.setSession({
          user: result.user,
          patient: result.patient,
          hospitalId: result.user.hospitalId ?? '',
          role: result.role,
          permissions: result.permissions,
          token: result.token,
          refreshToken: result.refreshToken,
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
        <div className="max-w-6xl mx-auto px-6 py-2 flex items-center gap-3">
          <Link href="/" className="hover:opacity-80 transition">
            {/* A hospital's own mark, before anyone has signed in — which is
                why GET /hospitals/current carries the logo and is public. */}
            {hospital?.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={hospital.logoUrl}
                alt={hospitalName}
                className="w-20 h-20 object-contain"
              />
            ) : (
              <Image src="/logo/logo-full.png" alt={hospitalName} width={80} height={80} className="w-20 h-20 object-contain" />
            )}
          </Link>
        </div>
      </div>

      {/* Login Form */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8 space-y-8 border border-cyan-100">
          <div className="text-center">
            <h2 className="text-3xl font-bold bg-gradient-to-r from-cyan-600 to-brand-teal bg-clip-text text-transparent">Sign In</h2>
            <p className="text-slate-600 mt-2">
              {isHospitalSubdomain ? `Access your ${hospitalName} account` : 'Platform administrator access'}
            </p>
          </div>

          {/* Login Type Selector — only on hospital subdomains */}
          {isHospitalSubdomain && (
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
                        ? 'bg-gradient-to-r from-cyan-500 to-brand-teal text-white shadow-lg'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Registration success banner */}
          {justRegistered && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              <p className="text-green-700 text-sm">Account created! Sign in to access your dashboard.</p>
            </div>
          )}

          {/* Password-reset success banner */}
          {justReset && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              <p className="text-green-700 text-sm">Password updated! Sign in with your new password.</p>
            </div>
          )}

          <FormikProvider value={formik}>
            <form onSubmit={formik.handleSubmit} className="space-y-4" noValidate>
              <FormField name="email" label="Email" type="email" placeholder="your.email@example.com" icon={Mail} required />
              <FormField name="password" label="Password" type="password" placeholder="••••••••" icon={Lock} required />

              {/* Forgot password link — only on hospital subdomains; superadmin
                  has no self-service reset path from the platform root. */}
              {isHospitalSubdomain && (
                <div className="flex justify-end -mt-2">
                  <Link href="/forgot-password" className="text-xs text-cyan-600 hover:text-teal-600 flex items-center gap-1">
                    <KeyRound className="w-3 h-3" />
                    Forgot password?
                  </Link>
                </div>
              )}

              {/* Error Message — sits right above the button so it's closest to the action */}
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-center gap-2.5">
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                  <p className="text-red-700 text-sm">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading || formik.isSubmitting}
                className="w-full bg-gradient-to-r from-cyan-500 to-brand-teal text-white py-2 rounded-lg font-semibold hover:shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading || formik.isSubmitting ? 'Signing in...' : 'Sign In'}
              </button>
            </form>
          </FormikProvider>

          {isHospitalSubdomain && (
            <div className="text-center">
              <p className="text-slate-600 text-sm">
                Don&apos;t have an account?{' '}
                <Link href="/register" className="text-cyan-600 font-semibold hover:text-teal-600">
                  Create one
                </Link>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


// `useSearchParams` opts the subtree into client-side rendering, and Next
// refuses to prerender a page that reaches for it without a boundary — which
// failed the production build outright, not just this page. The fallback is the
// page's own chrome rather than a spinner, so the form appearing is the only
// thing that changes when hydration lands.
export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginForm />
    </Suspense>
  );
}
