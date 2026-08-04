'use client';

import { useMemo, useState } from 'react';
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import { Award, HeartPulse, Loader2, Mail, Phone, Stethoscope } from 'lucide-react';
import { toast } from 'sonner';
import { authStorage } from '@/lib/auth';
import { apiError } from '@/lib/apiError';
import {
  useGetDoctorByUserQuery,
  useListDepartmentsQuery,
  useUpdateDoctorMutation,
  useUpdateOwnAccountMutation,
} from '@/store/api';
import { DashboardShell } from '@/components/DashboardShell';
import type { RoleViewProps } from '@/components/RoleView';
import { FormField } from '@/components/form/FormField';
import { doctorRole } from '@/lib/roles';
import type { AuthSession } from '@/lib/types';

/**
 * The account form shared by clinical staff. The doctor and nurse pages this
 * replaces were 77% identical — the difference is a handful of professional
 * fields, described by the variables below.
 */

// Fields every staff member edits. Email uniqueness needs the current user's id,
// so the schema is built per session rather than declared once.
const baseFields = () =>
  Yup.object({
    name: Yup.string().trim().required('Name is required').max(100, 'Too long'),
    email: Yup.string()
      .trim()
      .email('Enter a valid email')
      .required('Email is required'),
    phone: Yup.string()
      .trim()
      .required('Phone is required')
      .matches(/^[+]?[\d\s().-]{7,20}$/, 'Enter a valid phone number'),
  });

// Extra fields only a doctor has.
const doctorFields = Yup.object({
  specialization: Yup.string().required('Select a specialization'),
  qualification: Yup.string().trim().required('Qualification is required'),
  experienceYears: Yup.number()
    .transform((value, original) => (original === '' ? undefined : value))
    .typeError('Must be a number')
    .min(0, 'Cannot be negative')
    .required('Experience is required'),
  consultationFee: Yup.number()
    .transform((value, original) => (original === '' ? undefined : value))
    .typeError('Must be a number')
    .min(0, 'Cannot be negative')
    .required('Fee is required'),
});

export function StaffProfile({ session }: RoleViewProps) {
  const isDoctor = session.user.role === doctorRole;

  const [currentSession, setCurrentSession] = useState<AuthSession>(session);

  const { data: doctor } = useGetDoctorByUserQuery(session.user.id, { skip: !isDoctor });
  const { data: departments = [] } = useListDepartmentsQuery(undefined, { skip: !isDoctor });
  const [updateDoctor] = useUpdateDoctorMutation();
  const [updateOwnAccount] = useUpdateOwnAccountMutation();

  const specializationOptions = useMemo(() => {
    const names = departments.map((d) => d.name);
    if (doctor?.specialization && !names.includes(doctor.specialization)) {
      names.unshift(doctor.specialization);
    }
    return names.map((name) => ({ value: name, label: name }));
  }, [departments, doctor]);

  const schema = useMemo(() => {
    const base = baseFields();
    return isDoctor ? base.concat(doctorFields) : base;
  }, [isDoctor]);

  // Their own account details; the doctor record adds the professional ones.
  const currentUser = currentSession.user;

  // Wait for the doctor record before offering fields that belong to it.
  if (isDoctor && !doctor) {
    return (
      <DashboardShell role={session.user.role} userName={session.user.name} title="Profile" subtitle="Your professional details">
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
        </div>
      </DashboardShell>
    );
  }

  const heading = isDoctor ? `Dr. ${currentSession.user.name}` : currentSession.user.name;

  return (
    <DashboardShell
      role={currentSession.user.role}
      userName={currentSession.user.name}
      title="Profile"
      subtitle={isDoctor ? 'Your professional details' : 'Your account details'}
    >
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Summary card */}
        <div className="bg-gradient-to-r from-cyan-500 to-brand-teal text-white rounded-lg p-6 flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center text-2xl font-bold shrink-0">
            {currentSession.user.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <h2 className="text-xl font-bold truncate">{heading}</h2>
            <p className="text-cyan-100 flex items-center gap-2">
              {isDoctor ? (
                <>
                  <Stethoscope className="w-4 h-4" /> {doctor?.specialization}
                </>
              ) : (
                <>
                  <HeartPulse className="w-4 h-4" /> {currentSession.role?.label ?? 'Staff'}
                </>
              )}
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-sm text-cyan-50">
              <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" /> {currentUser?.email}</span>
              <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" /> {currentUser?.phone || '—'}</span>
              {isDoctor && (
                <span className="flex items-center gap-1">
                  <Award className="w-3.5 h-3.5" /> {doctor?.experienceYears} yrs
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Edit form */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="font-semibold text-slate-900 mb-4">Edit Profile</h3>
          <Formik<{name: string; email: string; phone: string; specialization: string; qualification: string; experienceYears: string; consultationFee: string}>
            initialValues={{
              name: currentUser?.name ?? '',
              email: currentUser?.email ?? '',
              phone: currentUser?.phone ?? '',
              specialization: doctor?.specialization ?? '',
              qualification: doctor?.qualification ?? '',
              experienceYears: String(doctor?.experienceYears ?? ''),
              consultationFee: String(doctor?.consultationFee ?? ''),
            }}
            enableReinitialize
            validationSchema={schema}
            onSubmit={async (values, { setSubmitting, setStatus }) => {
              const name = values.name.trim();
              const email = values.email.trim();
              const phone = values.phone.trim();
              setStatus(undefined);

              try {
                if (isDoctor && doctor) {
                  await updateDoctor({
                    id: doctor.id,
                    body: {
                      name,
                      email,
                      phone,
                      specialization: values.specialization,
                      qualification: values.qualification.trim(),
                      experienceYears: Number(values.experienceYears),
                      consultationFee: Number(values.consultationFee),
                    },
                  }).unwrap();
                } else {
                  await updateOwnAccount({ name, email, phone }).unwrap();
                }
              } catch (err) {
                setStatus(apiError(err, 'Could not save your profile'));
                setSubmitting(false);
                return;
              }

              // Keep the stored session in sync so the shell/header update immediately.
              const stored = authStorage.getSession();
              if (stored) {
                const updated = { ...stored, user: { ...stored.user, name, email, phone } };
                authStorage.setSession(updated);
                setCurrentSession(updated);
              }
              toast.success('Profile updated');
              setSubmitting(false);
            }}
          >
            {({ isSubmitting, status }) => (
            <Form className="grid sm:grid-cols-2 gap-4">
              {status && (
                <p className="sm:col-span-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{status}</p>
              )}
              <div className="sm:col-span-2">
                <FormField name="name" label="Full Name" placeholder="e.g. Sarah Smith" required />
              </div>
              <FormField name="email" label="Email" type="email" placeholder="you@example.com" required />
              <FormField name="phone" label="Phone Number" type="tel" placeholder="+91 98765 43210" required />
              {isDoctor && (
                <>
                  <div className="sm:col-span-2">
                    <FormField
                      name="specialization"
                      label="Specialization"
                      as="select"
                      placeholder="Select a department"
                      options={specializationOptions}
                      required
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <FormField name="qualification" label="Qualification" placeholder="e.g. MBBS, MD" required />
                  </div>
                  <FormField name="experienceYears" label="Experience (years)" type="number" min="0" placeholder="0" required />
                  <FormField name="consultationFee" label="Consultation Fee (₹)" type="number" min="0" placeholder="0" required />
                </>
              )}
              <div className="sm:col-span-2 flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-6 py-2 bg-gradient-to-r from-cyan-500 to-brand-teal text-white rounded-lg hover:shadow-lg font-semibold transition disabled:opacity-50"
                >
                  {isSubmitting ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </Form>
            )}
          </Formik>
        </div>
      </div>

    </DashboardShell>
  );
}
