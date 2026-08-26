'use client';

import { X } from 'lucide-react';
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import { toast } from 'sonner';
import { FormField } from '@/components/form/FormField';
import { PhoneField, toPhoneDigits, withPrefix } from '@/components/form/PhoneField';
import { apiError } from '@/lib/apiError';
import { useUpdateDoctorMutation, useListDepartmentsQuery, useGetSuperadminDepartmentsPagedQuery } from '@/store/api';
import type { Doctor } from '@/lib/types';
import { Spinner } from '@/components/ui/spinner';

const editSchema = Yup.object({
  name: Yup.string().trim().required('Name is required').max(100, 'Too long'),
  email: Yup.string().trim().email('Enter a valid email').required('Email is required'),
  phone: Yup.string().test('phone', 'Enter a valid 10-digit mobile number', (v) => !v || /^\d{10}$/.test(v)),
  departmentId: Yup.string(),
  specialization: Yup.string().trim().max(100, 'Too long'),
  qualification: Yup.string().trim().max(100, 'Too long'),
  experienceYears: Yup.number().min(0, 'Cannot be negative').integer('Must be a whole number'),
  consultationFee: Yup.number().min(0, 'Cannot be negative'),
});

interface Props {
  /** Doctor to edit. Pass null to close the modal. */
  doctor: Doctor | null;
  onClose: () => void;
  onSuccess: () => void;
  /** Superadmin-only: routes the request to the correct tenant. */
  hospitalId?: string;
}

export function EditDoctorModal({ doctor, onClose, onSuccess, hospitalId }: Props) {
  const [updateDoctor] = useUpdateDoctorMutation();
  const isSuperadmin = hospitalId !== undefined;

  // Admin: tenant-scoped. Superadmin: scoped to the doctor's hospital.
  const { data: adminDepts = [] } = useListDepartmentsQuery(undefined, { skip: isSuperadmin });
  const { data: superDeptsPage } = useGetSuperadminDepartmentsPagedQuery(
    { hospitalId: hospitalId || undefined, limit: 200, offset: 0 },
    { skip: !isSuperadmin },
  );
  const departments = isSuperadmin ? (superDeptsPage?.items ?? []) : adminDepts;

  if (!doctor) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-2xl max-w-lg w-full max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 shrink-0">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Edit Doctor</h3>
            <p className="text-xs text-slate-400">{doctor.user?.email}</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-900">
            <X className="w-5 h-5" />
          </button>
        </div>
        <Formik
          initialValues={{
            name: doctor.user?.name ?? '',
            email: doctor.user?.email ?? '',
            phone: toPhoneDigits(doctor.user?.phone ?? ''),
            departmentId: doctor.departmentId ?? '',
            specialization: doctor.specialization ?? '',
            qualification: doctor.qualification ?? '',
            experienceYears: doctor.experienceYears ?? 0,
            consultationFee: doctor.consultationFee ?? 0,
          }}
          validationSchema={editSchema}
          onSubmit={async (values, { setSubmitting, setStatus }) => {
            setStatus('');
            try {
              await updateDoctor({
                id: doctor.id,
                hospitalId,
                body: {
                  name: values.name.trim(),
                  email: values.email.trim(),
                  phone: withPrefix(values.phone),
                  departmentId: values.departmentId || undefined,
                  specialization: values.specialization.trim(),
                  qualification: values.qualification.trim(),
                  experienceYears: Number(values.experienceYears),
                  consultationFee: Number(values.consultationFee),
                },
              }).unwrap();
              toast.success('Doctor updated');
              onSuccess();
              onClose();
            } catch (err) {
              setStatus(apiError(err, 'Failed to save doctor'));
            } finally {
              setSubmitting(false);
            }
          }}
        >
          {({ isSubmitting, status, values, setFieldValue }) => (
            <Form className="flex flex-col flex-1 min-h-0">
              <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
                <div className="grid grid-cols-2 gap-4">
                  <FormField name="name" label="Full Name" placeholder="Dr. Jane Smith" required />
                  <FormField name="email" label="Email" type="email" placeholder="doctor@hospital.com" required />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <PhoneField name="phone" label="Phone" />
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Department</label>
                    <select
                      value={values.departmentId}
                      onChange={(e) => setFieldValue('departmentId', e.target.value)}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500 bg-white"
                    >
                      <option value="">Select department…</option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <FormField name="specialization" label="Specialization" placeholder="e.g. Interventional Cardiology" />
                  <FormField name="qualification" label="Qualification" placeholder="e.g. MBBS, MD" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <FormField name="experienceYears" label="Experience (years)" type="number" placeholder="5" />
                  <FormField name="consultationFee" label="Consultation Fee (₹)" type="number" placeholder="500" />
                </div>
                {status && (
                  <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    {status}
                  </p>
                )}
              </div>
              <div className="flex gap-3 px-6 py-4 border-t border-slate-100 shrink-0">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center justify-center gap-2 flex-1 px-4 py-2.5 bg-gradient-to-r from-cyan-500 to-brand-teal text-white rounded-lg text-sm font-semibold hover:shadow-lg transition disabled:opacity-50"
                >
                  {isSubmitting ? <Spinner size="sm" label="Saving…" /> : 'Save Changes'}
                </button>
              </div>
            </Form>
          )}
        </Formik>
      </div>
    </div>
  );
}
