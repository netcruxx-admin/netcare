'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useFormik, FormikProvider } from 'formik';
import * as Yup from 'yup';
import { Heart, Mail, Lock, AlertCircle } from 'lucide-react';
import { useActiveHospital } from '@/hooks/useActiveHospital';
import { authOperations, authStorage } from '@/lib/auth';
import { FormField } from '@/components/form/FormField';

type LoginType = 'patient' | 'doctor' | 'admin' | 'lab' | 'nurse';

const DEMO_CREDENTIALS: Record<LoginType, { email: string; password: string }> = {
  patient: { email: 'patient@example.com', password: 'password123' },
  doctor: { email: 'obgyn@example.com', password: 'password123' },
  admin: { email: 'admin@example.com', password: 'password123' },
  lab: { email: 'lab@example.com', password: 'password123' },
  nurse: { email: 'nurse@example.com', password: 'password123' },
};

const loginSchema = Yup.object({
  email: Yup.string().email('Please enter a valid email').required('Email is required'),
  password: Yup.string().required('Password is required'),
});

export default function LoginPage() {
  const router = useRouter();
  const hospital = useActiveHospital();
  const [error, setError] = useState('');
  const [loginType, setLoginType] = useState<LoginType>('patient');

  const formik = useFormik({
    initialValues: DEMO_CREDENTIALS.patient,
    validationSchema: loginSchema,
    onSubmit: async (values, { setSubmitting }) => {
      setError('');
      try {
        const session = await authOperations.login(values.email, values.password);

        if (!session) {
          setError('Invalid email or password');
          return;
        }

        // Verify role matches login type
        if (session.user.role !== loginType) {
          setError(`This account is not a ${loginType} account`);
          return;
        }

        authStorage.setSession(session);

        if (session.user.role === 'patient') {
          router.push('/dashboard/patient');
        } else if (session.user.role === 'doctor') {
          router.push('/dashboard/doctor');
        } else if (session.user.role === 'admin') {
          router.push('/dashboard/admin');
        } else if (session.user.role === 'lab') {
          router.push('/dashboard/lab');
        } else if (session.user.role === 'nurse') {
          router.push('/dashboard/nurse');
        }
      } catch (err) {
        setError('An error occurred. Please try again.');
      } finally {
        setSubmitting(false);
      }
    },
  });

  const handleTypeSelect = (type: LoginType) => {
    setLoginType(type);
    setError('');
    // Prefill the matching demo credentials for convenience.
    formik.setValues(DEMO_CREDENTIALS[type]);
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
            {hospital.name}
          </Link>
        </div>
      </div>

      {/* Login Form */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8 space-y-8 border border-cyan-100">
          <div className="text-center">
            <h2 className="text-3xl font-bold bg-gradient-to-r from-cyan-600 to-teal-600 bg-clip-text text-transparent">Sign In</h2>
            <p className="text-slate-600 mt-2">Access your {hospital.name} account</p>
          </div>

          {/* Login Type Selector */}
          <div className="space-y-3">
            <label className="block text-sm font-medium text-slate-700">Login As</label>
            <div className="grid grid-cols-3 gap-2">
              {(['patient', 'doctor', 'admin', 'lab', 'nurse'] as const).map((type) => (
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

          {/* Demo Credentials */}
          <div className="bg-gradient-to-br from-cyan-50 to-teal-50 border border-cyan-200 rounded-xl p-4">
            <p className="text-sm font-semibold text-cyan-900 mb-2">Demo Credentials:</p>
            <p className="text-sm text-cyan-800">Email: <span className="font-mono">{DEMO_CREDENTIALS[loginType].email}</span></p>
            <p className="text-sm text-cyan-800">Password: <span className="font-mono">{DEMO_CREDENTIALS[loginType].password}</span></p>
            {loginType === 'doctor' && (
              <p className="text-xs text-cyan-700 mt-2">
                By department: <span className="font-mono">obgyn@</span>, <span className="font-mono">neonatology@</span>,{' '}
                <span className="font-mono">maternal@</span>, <span className="font-mono">pediatrics@</span> — all <span className="font-mono">@example.com</span>. The sidebar adapts to each department.
              </p>
            )}
          </div>

          <FormikProvider value={formik}>
            <form onSubmit={formik.handleSubmit} className="space-y-4" noValidate>
              <FormField name="email" label="Email" type="email" placeholder="your.email@example.com" icon={Mail} required />
              <FormField name="password" label="Password" type="password" placeholder="••••••••" icon={Lock} required />

              <button
                type="submit"
                disabled={formik.isSubmitting}
                className="w-full bg-gradient-to-r from-cyan-500 to-teal-600 text-white py-2 rounded-lg font-semibold hover:shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {formik.isSubmitting ? 'Signing in...' : 'Sign In'}
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
