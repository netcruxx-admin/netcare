'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import { toast } from 'sonner';
import { superadminPost } from '@/lib/superadminFetch';
import {
  useCreateUserMutation,
  useListDepartmentsQuery,
  useGetSuperadminDepartmentsPagedQuery,
} from '@/store/api';
import { FormField } from '@/components/form/FormField';
import { PhoneField, withPrefix } from '@/components/form/PhoneField';
import { apiError } from '@/lib/apiError';
import { requireEmailOrPhone } from '@/lib/contactMethod';
import { doctorRole } from '@/lib/roles';
import type { HospitalInfo } from '@/store/api';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  // Superadmin-only: pass hospitals to enable hospital selector
  hospitals?: HospitalInfo[];
  preselectedHospitalId?: string;
}

interface DoctorFormValues {
  name: string;
  email: string;
  password: string;
  phone: string;
  departmentId: string;
  specialization: string;
  qualification: string;
  experienceYears: string;
}

const EMPTY_FORM: DoctorFormValues = {
  name: '', email: '', password: 'password123', phone: '',
  departmentId: '', specialization: '', qualification: '', experienceYears: '',
};

const schema = Yup.object({
  name: Yup.string().trim().required('Name is required'),
  // Neither is required on its own — login accepts either (see /auth login)
  // — but an account needs at least one way in.
  email: requireEmailOrPhone(Yup.string().trim().email('Enter a valid email')),
  phone: Yup.string().test('phone', 'Enter a valid 10-digit mobile number', (v) => !v || /^\d{10}$/.test(v)),
});

export function AddDoctorModal({ open, onClose, onSuccess, preselectedHospitalId = '', hospitals }: Props) {
  const isSuperadmin = hospitals !== undefined;
  const [hospitalId, setHospitalId] = useState(preselectedHospitalId);
  const [error, setError] = useState('');
  const [createUser] = useCreateUserMutation();

  // Admin: tenant-scoped departments. Superadmin: scoped to the selected hospital.
  const { data: adminDepts = [] } = useListDepartmentsQuery(undefined, { skip: isSuperadmin });
  const { data: superDeptsPage } = useGetSuperadminDepartmentsPagedQuery(
    { hospitalId: hospitalId || undefined, limit: 200, offset: 0 },
    { skip: !isSuperadmin },
  );
  const departments = isSuperadmin ? (superDeptsPage?.items ?? []) : adminDepts;

  const handleClose = () => {
    setError(''); setHospitalId(preselectedHospitalId); onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent showCloseButton={false} className="max-w-lg max-h-[90vh] flex flex-col p-0 gap-0">
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 shrink-0">
          <DialogTitle className="text-lg font-bold text-slate-900">Add Doctor</DialogTitle>
          <button onClick={handleClose} className="text-slate-400 hover:text-slate-900 p-1"><X className="w-5 h-5" /></button>
        </div>
        <Formik
          initialValues={EMPTY_FORM}
          validationSchema={schema}
          onSubmit={async (values, { setSubmitting, resetForm }) => {
            if (isSuperadmin && !hospitalId) { setError('Please select a hospital'); setSubmitting(false); return; }
            setError('');
            const body = {
              name: values.name.trim(), email: values.email.trim(),
              password: values.password, role: doctorRole,
              phone: withPrefix(values.phone) || undefined,
              departmentId: values.departmentId || undefined,
              specialization: values.specialization.trim() || undefined,
              qualification: values.qualification.trim() || undefined,
              experienceYears: values.experienceYears ? Number(values.experienceYears) : undefined,
            };
            try {
              if (isSuperadmin) {
                await superadminPost('/users', hospitalId, body);
              } else {
                await createUser(body).unwrap();
              }
              toast.success('Doctor added successfully');
              onSuccess();
              resetForm();
              handleClose();
            } catch (err) {
              setError(apiError(err, 'Failed to add doctor'));
            } finally {
              setSubmitting(false);
            }
          }}
        >
          {({ values, setFieldValue, isSubmitting, dirty }) => (
            <Form className="flex flex-col flex-1 min-h-0 px-6 py-5 space-y-4 overflow-y-auto">
              {/* Hospital selector — superadmin only */}
              {isSuperadmin && (
                preselectedHospitalId ? (
                  <div className="bg-slate-50 rounded-lg px-3 py-2 text-sm text-slate-600">
                    Hospital: <span className="font-medium text-slate-900">{hospitals!.find(h => h.id === preselectedHospitalId)?.name}</span>
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Hospital <span className="text-red-500">*</span></label>
                    <select
                      value={hospitalId}
                      onChange={(e) => { setHospitalId(e.target.value); setFieldValue('departmentId', ''); }}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500 bg-white"
                    >
                      <option value="">Select a hospital…</option>
                      {hospitals!.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
                    </select>
                  </div>
                )
              )}

              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Account</p>
              <div className="grid grid-cols-2 gap-4">
                <FormField name="name" label="Full Name" placeholder="Dr. Priya Mehta" required />
                <PhoneField name="phone" label="Phone" />
                <FormField name="email" label="Email" type="email" placeholder="doctor@hospital.com" />
                <FormField name="password" label="Password" type="password" />
              </div>

              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide pt-1">Professional Details</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Department</label>
                  <select
                    value={values.departmentId}
                    onChange={(e) => setFieldValue('departmentId', e.target.value)}
                    disabled={isSuperadmin && !hospitalId}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500 bg-white disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                  >
                    <option value="">{isSuperadmin && !hospitalId ? 'Select a hospital first…' : 'Select department…'}</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
                <FormField name="specialization" label="Specialization" placeholder="e.g. Interventional Cardiology" />
                <FormField name="qualification" label="Qualification" placeholder="e.g. MBBS, MD" />
                <FormField name="experienceYears" label="Experience (years)" type="number" min="0" placeholder="e.g. 10" />
              </div>

              {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={handleClose} className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 text-sm font-medium transition">Cancel</button>
                <Button type="submit" disabled={isSubmitting || !dirty} variant="brand" className="flex-1">{isSubmitting ? <Spinner size="sm" label="Adding…" /> : 'Add Doctor'}</Button>
              </div>
            </Form>
          )}
        </Formik>
      </DialogContent>
    </Dialog>
  );
}
