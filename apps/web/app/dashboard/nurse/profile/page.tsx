'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import { Mail, Phone, HeartPulse, CheckCircle2 } from 'lucide-react';
import { authStorage } from '@/lib/auth';
import { dbOperations } from '@/lib/db';
import { DashboardShell } from '@/components/DashboardShell';
import { FormField } from '@/components/form/FormField';

export default function NurseProfilePage() {
  const router = useRouter();
  const [session, setSession] = useState<ReturnType<typeof authStorage.getSession>>(null);
  const [toast, setToast] = useState('');

  useEffect(() => {
    const s = authStorage.getSession();
    if (!s || s.user.role !== 'nurse') {
      router.push('/login');
      return;
    }
    setSession(s);
  }, [router]);

  const schema = useMemo(
    () =>
      Yup.object({
        name: Yup.string().trim().required('Name is required').max(100, 'Too long'),
        email: Yup.string()
          .trim()
          .email('Enter a valid email')
          .required('Email is required')
          .test('unique-email', 'Email already in use', (value) => {
            if (!value) return true;
            const existing = dbOperations.getUserByEmail(value.trim());
            return !existing || existing.id === session?.user.id;
          }),
        phone: Yup.string()
          .trim()
          .required('Phone is required')
          .matches(/^[+]?[\d\s().-]{7,20}$/, 'Enter a valid phone number'),
      }),
    [session]
  );

  if (!session) return null;

  const currentUser = dbOperations.getUserById(session.user.id);

  return (
    <DashboardShell role="nurse" userName={session.user.name} title="Profile" subtitle="Your account details">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Summary card */}
        <div className="bg-gradient-to-r from-cyan-500 to-teal-600 text-white rounded-lg p-6 flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center text-2xl font-bold shrink-0">
            {session.user.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <h2 className="text-xl font-bold truncate">{session.user.name}</h2>
            <p className="text-cyan-100 flex items-center gap-2"><HeartPulse className="w-4 h-4" /> Nurse</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-sm text-cyan-50">
              <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" /> {currentUser?.email}</span>
              <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" /> {currentUser?.phone || '—'}</span>
            </div>
          </div>
        </div>

        {/* Edit form */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="font-semibold text-slate-900 mb-4">Edit Profile</h3>
          <Formik
            initialValues={{
              name: currentUser?.name ?? '',
              email: currentUser?.email ?? '',
              phone: currentUser?.phone ?? '',
            }}
            enableReinitialize
            validationSchema={schema}
            onSubmit={(values) => {
              dbOperations.updateUser(session.user.id, {
                name: values.name.trim(),
                email: values.email.trim(),
                phone: values.phone.trim(),
              });
              // Keep the stored session in sync so the shell/header update immediately.
              const s = authStorage.getSession();
              if (s) {
                const updated = { ...s, user: { ...s.user, name: values.name.trim(), email: values.email.trim(), phone: values.phone.trim() } };
                authStorage.setSession(updated);
                setSession(updated);
              }
              setToast('Profile updated');
              setTimeout(() => setToast(''), 2500);
            }}
          >
            <Form className="grid sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <FormField name="name" label="Full Name" placeholder="e.g. Anita Rao" required />
              </div>
              <FormField name="email" label="Email" type="email" placeholder="nurse@example.com" required />
              <FormField name="phone" label="Phone Number" type="tel" placeholder="+91 98765 43210" required />
              <div className="sm:col-span-2 flex justify-end pt-2">
                <button type="submit" className="px-6 py-2 bg-gradient-to-r from-cyan-500 to-teal-600 text-white rounded-lg hover:shadow-lg font-semibold transition">
                  Save Changes
                </button>
              </div>
            </Form>
          </Formik>
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white text-sm px-4 py-2 rounded-lg shadow-lg flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-green-400" /> {toast}
        </div>
      )}
    </DashboardShell>
  );
}
