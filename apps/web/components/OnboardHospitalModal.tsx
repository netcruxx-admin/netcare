'use client';

import { useState } from 'react';
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import { X, CheckCircle } from 'lucide-react';
import { FormField } from '@/components/form/FormField';
import { useOnboardHospitalMutation } from '@/store/api';

const CATEGORIES = [
  { id: 'maternity', label: 'Maternity & Newborn' },
  { id: 'multi-specialty', label: 'Multi-Specialty' },
  { id: 'dental', label: 'Dental Clinic' },
  { id: 'eye', label: 'Eye Hospital' },
  { id: 'diagnostic', label: 'Diagnostic Center' },
];

const CATEGORY_THEMES: Record<string, { primary: string; primaryDark: string }> = {
  maternity: { primary: '#0891b2', primaryDark: '#0d9488' },
  'multi-specialty': { primary: '#4f46e5', primaryDark: '#4338ca' },
  dental: { primary: '#0d9488', primaryDark: '#0f766e' },
  eye: { primary: '#2563eb', primaryDark: '#1d4ed8' },
  diagnostic: { primary: '#7c3aed', primaryDark: '#6d28d9' },
};

const schema = Yup.object({
  name: Yup.string().trim().required('Hospital name is required'),
  subdomain: Yup.string()
    .trim()
    .required('Subdomain is required')
    .matches(/^[a-z0-9-]+$/, 'Only lowercase letters, numbers, and hyphens'),
  category: Yup.string().required('Category is required'),
  adminEmail: Yup.string().email('Invalid email').required('Admin email is required'),
  adminName: Yup.string().trim().required('Admin name is required'),
  adminPassword: Yup.string().min(6, 'At least 6 characters').required('Password is required'),
  primary: Yup.string().required(),
  primaryDark: Yup.string().required(),
});

interface Props {
  open: boolean;
  onClose: () => void;
}

export function OnboardHospitalModal({ open, onClose }: Props) {
  const [created, setCreated] = useState<{ name: string; subdomain: string } | null>(null);
  const [onboardHospital] = useOnboardHospitalMutation();

  if (!open) return null;

  const handleClose = () => {
    setCreated(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl my-8">
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100">
          <h3 className="text-lg font-bold text-slate-900">Onboard a Hospital</h3>
          <button onClick={handleClose} className="text-slate-400 hover:text-slate-900 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5">
          {created ? (
            <div className="text-center py-8">
              <CheckCircle className="w-14 h-14 text-emerald-500 mx-auto mb-4" />
              <p className="text-xl font-bold text-slate-900 mb-1">{created.name} created!</p>
              <p className="text-sm text-slate-500 mb-1">
                Admin can log in at{' '}
                <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">
                  {created.subdomain}.localhost:3000
                </span>
              </p>
              <p className="text-xs text-slate-400 mb-6">with the credentials you set above.</p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => setCreated(null)}
                  className="px-5 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 hover:bg-slate-50 transition"
                >
                  Add another
                </button>
                <button
                  onClick={handleClose}
                  className="px-5 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-700 transition"
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            <Formik
              initialValues={{
                name: '',
                subdomain: '',
                category: 'multi-specialty',
                primary: '#4f46e5',
                primaryDark: '#4338ca',
                adminEmail: '',
                adminName: '',
                adminPassword: 'password123',
              }}
              validationSchema={schema}
              onSubmit={async (values, { setSubmitting, setFieldError }) => {
                try {
                  const result = await onboardHospital({
                    name: values.name.trim(),
                    subdomain: values.subdomain.trim(),
                    category: values.category,
                    theme: { primary: values.primary, primaryDark: values.primaryDark },
                    adminEmail: values.adminEmail.trim(),
                    adminName: values.adminName.trim(),
                    adminPassword: values.adminPassword,
                  }).unwrap();
                  setCreated({ name: result.name, subdomain: result.subdomain });
                } catch (err: unknown) {
                  const detail = (err as { data?: { detail?: string } })?.data?.detail;
                  setFieldError('subdomain', detail ?? 'Failed to create hospital');
                } finally {
                  setSubmitting(false);
                }
              }}
            >
              {({ isSubmitting, values, setFieldValue }) => (
                <Form className="space-y-5">
                  {/* Row 1: Hospital Name + Subdomain */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField name="name" label="Hospital Name" placeholder="e.g. City Eye Care" required />
                    <FormField name="subdomain" label="Subdomain" placeholder="e.g. cityeyecare" required />
                  </div>

                  {/* Row 2: Category + Colours */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Category <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={values.category}
                        onChange={(e) => {
                          const cat = e.target.value;
                          setFieldValue('category', cat);
                          const t = CATEGORY_THEMES[cat];
                          if (t) {
                            setFieldValue('primary', t.primary);
                            setFieldValue('primaryDark', t.primaryDark);
                          }
                        }}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-cyan-500"
                      >
                        {CATEGORIES.map((c) => (
                          <option key={c.id} value={c.id}>{c.label}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Primary Colour</label>
                      <div className="flex items-center gap-2 h-9">
                        <input
                          type="color"
                          value={values.primary}
                          onChange={(e) => setFieldValue('primary', e.target.value)}
                          className="h-9 w-12 rounded border border-slate-300 cursor-pointer"
                        />
                        <span className="text-xs font-mono text-slate-500">{values.primary}</span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Accent Colour</label>
                      <div className="flex items-center gap-2 h-9">
                        <input
                          type="color"
                          value={values.primaryDark}
                          onChange={(e) => setFieldValue('primaryDark', e.target.value)}
                          className="h-9 w-12 rounded border border-slate-300 cursor-pointer"
                        />
                        <span className="text-xs font-mono text-slate-500">{values.primaryDark}</span>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-slate-100 pt-4">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4">First Admin Account</p>

                    {/* Row 3: Admin Name + Admin Email */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                      <FormField name="adminName" label="Admin Name" placeholder="e.g. Dr. Raj Kumar" required />
                      <FormField name="adminEmail" label="Admin Email" type="email" placeholder="admin@hospital.com" required />
                    </div>

                    {/* Row 4: Password (half width) */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <FormField name="adminPassword" label="Admin Password" type="password" required />
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-3 pt-1">
                    <button
                      type="button"
                      onClick={handleClose}
                      className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition text-sm font-medium"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="flex-1 px-4 py-2.5 bg-slate-900 text-white rounded-lg font-semibold text-sm hover:bg-slate-700 transition disabled:opacity-50"
                    >
                      {isSubmitting ? 'Creating…' : 'Create Hospital'}
                    </button>
                  </div>
                </Form>
              )}
            </Formik>
          )}
        </div>
      </div>
    </div>
  );
}
