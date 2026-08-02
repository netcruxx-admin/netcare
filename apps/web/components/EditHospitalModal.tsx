'use client';

import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { FormField } from '@/components/form/FormField';
import { useUpdateHospitalMutation } from '@/store/api';
import type { HospitalInfo } from '@/store/api';

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
  tagline: Yup.string().trim().max(120, 'Keep it under 120 characters'),
  category: Yup.string().required('Category is required'),
  currency: Yup.string().trim().required('Currency is required'),
  status: Yup.string().oneOf(['active', 'inactive']).required(),
  primary: Yup.string().required(),
  primaryDark: Yup.string().required(),
});

interface Props {
  open: boolean;
  hospital: HospitalInfo;
  onClose: () => void;
  onSuccess: () => void;
}

export function EditHospitalModal({ open, hospital, onClose, onSuccess }: Props) {
  const [updateHospital] = useUpdateHospitalMutation();

  if (!open) return null;

  const theme = hospital.theme as Record<string, string>;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl my-8">
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100">
          <h3 className="text-lg font-bold text-slate-900">Edit Hospital</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-900 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5">
          <Formik
            initialValues={{
              name: hospital.name,
              tagline: hospital.tagline ?? '',
              category: hospital.category,
              currency: hospital.currency ?? 'INR',
              status: hospital.status ?? 'active',
              primary: theme?.primary ?? '#4f46e5',
              primaryDark: theme?.primaryDark ?? '#4338ca',
            }}
            validationSchema={schema}
            onSubmit={async (values, { setSubmitting, setFieldError }) => {
              try {
                await updateHospital({
                  id: hospital.id,
                  body: {
                    name: values.name.trim(),
                    tagline: values.tagline.trim(),
                    category: values.category,
                    currency: values.currency.trim(),
                    status: values.status,
                    theme: { primary: values.primary, primaryDark: values.primaryDark },
                  },
                }).unwrap();
                toast.success('Hospital updated');
                onSuccess();
              } catch (err: unknown) {
                const detail = (err as { data?: { detail?: string } })?.data?.detail;
                setFieldError('name', detail ?? 'Failed to update hospital');
              } finally {
                setSubmitting(false);
              }
            }}
          >
            {({ isSubmitting, values, setFieldValue }) => (
              <Form className="space-y-5">
                {/* Row 1: Hospital Name + Status */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField name="name" label="Hospital Name" placeholder="e.g. City Eye Care" required />
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Status <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={values.status}
                      onChange={(e) => setFieldValue('status', e.target.value)}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-cyan-500"
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                </div>

                {/* Row 2: Tagline */}
                <FormField name="tagline" label="Tagline" placeholder="e.g. Caring for you, every step of the way" />

                {/* Row 3: Category + Currency */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                  <FormField name="currency" label="Currency" placeholder="INR" required />
                </div>

                {/* Row 4: Colours */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

                {/* Subdomain note (read-only) */}
                <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-sm text-slate-500">
                  Subdomain <span className="font-mono text-slate-700">{hospital.subdomain}</span> is permanent and cannot be changed.
                </div>

                <div className="flex gap-3 pt-1">
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition text-sm font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1 px-4 py-2.5 bg-gradient-to-r from-cyan-500 to-brand-teal text-white rounded-lg font-semibold text-sm hover:shadow-lg transition disabled:opacity-50"
                  >
                    {isSubmitting ? 'Saving…' : 'Save Changes'}
                  </button>
                </div>
              </Form>
            )}
          </Formik>
        </div>
      </div>
    </div>
  );
}
