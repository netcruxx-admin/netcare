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
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

const editSchema = Yup.object({
  name: Yup.string().trim().required('Name is required').max(100, 'Too long'),
  email: Yup.string().trim().email('Enter a valid email').required('Email is required'),
  phone: Yup.string().test('phone', 'Enter a valid 10-digit mobile number', (v) => !v || /^\d{10}$/.test(v)),
  departmentId: Yup.string(),
  specialization: Yup.string().trim().max(100, 'Too long'),
  qualification: Yup.string().trim().max(100, 'Too long'),
  experienceYears: Yup.number().min(0, 'Cannot be negative').integer('Must be a whole number'),
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
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent showCloseButton={false} className="max-w-lg max-h-[90vh] flex flex-col p-0 gap-0">
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 shrink-0">
          <div>
            <DialogTitle className="text-lg font-bold text-slate-900">Edit Doctor</DialogTitle>
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
          {({ isSubmitting, status, values, setFieldValue, dirty }) => (
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
                <FormField name="experienceYears" label="Experience (years)" type="number" placeholder="5" />
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
                <Button
                  type="submit"
                  disabled={isSubmitting || !dirty}
                  variant="brand"
                  className="flex-1"
                >
                  {isSubmitting ? <Spinner size="sm" label="Saving…" /> : 'Save Changes'}
                </Button>
              </div>
            </Form>
          )}
        </Formik>
      </DialogContent>
    </Dialog>
  );
}
