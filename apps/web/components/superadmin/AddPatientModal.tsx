'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import { toast } from 'sonner';
import { superadminPost } from '@/lib/superadminFetch';
import { useCreateUserMutation } from '@/store/api';
import { BookAppointmentPrompt } from '@/components/patients/BookAppointmentPrompt';
import { FormField } from '@/components/form/FormField';
import { PhoneField, withPrefix } from '@/components/form/PhoneField';
import {
  PatientProfileFields,
  emptyPatientProfile,
  patientProfilePayload,
  patientProfileSchemaFields,
} from '@/components/patients/patientProfile';
import { apiError } from '@/lib/apiError';
import { requireEmailOrPhone } from '@/lib/contactMethod';
import { patientRole } from '@/lib/roles';
import type { HospitalInfo } from '@/store/api';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

/**
 * Registering a patient at the counter.
 *
 * Asks for exactly what the patient would be asked if they signed up
 * themselves — the fields come from PatientProfileFields, shared with the
 * public wizard and the edit modal. It used to ask for five things and stop,
 * which left address, allergies, next of kin and insurance uncollectable at
 * the desk even though the record had somewhere to put most of them.
 */

const schema = Yup.object({
  name: Yup.string().trim().required('Full name is required'),
  // Neither is required on its own — see requireEmailOrPhone — since login
  // accepts either (see /auth login).
  email: requireEmailOrPhone(Yup.string().trim().email('Enter a valid email')),
  phone: Yup.string().test('phone', 'Enter a valid 10-digit mobile number', (v) => !v || /^\d{10}$/.test(v)),
  password: Yup.string().min(8, 'At least 8 characters').required('Password is required'),
  dateOfBirth: Yup.string().required('Date of birth is required'),
  ...patientProfileSchemaFields,
});

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  // Superadmin-only: pass hospitals to enable hospital selector
  hospitals?: HospitalInfo[];
  preselectedHospitalId?: string;
}

export function AddPatientModal({ open, onClose, onSuccess, preselectedHospitalId = '', hospitals }: Props) {
  const isSuperadmin = hospitals !== undefined;
  const router = useRouter();
  const [hospitalId, setHospitalId] = useState(preselectedHospitalId);
  const [error, setError] = useState('');
  // Set once the patient is saved: swaps the form for the "book an appointment?"
  // prompt. Holds the new user's id so the booking screen can pre-select them.
  const [justCreated, setJustCreated] = useState<{ id: string; name: string } | null>(null);
  const [createUser] = useCreateUserMutation();

  const handleClose = () => {
    setError('');
    setHospitalId(preselectedHospitalId);
    setJustCreated(null);
    onClose();
  };

  if (justCreated) {
    return (
      <BookAppointmentPrompt
        patientName={justCreated.name}
        onSkip={handleClose}
        onBook={() => {
          router.push(`/dashboard/book?patientUser=${justCreated.id}`);
          handleClose();
        }}
      />
    );
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent showCloseButton={false} className="max-w-2xl max-h-[92vh] flex flex-col p-0 gap-0">
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 shrink-0">
          <DialogTitle className="text-lg font-bold text-slate-900">Add Patient</DialogTitle>
          <button onClick={handleClose} className="text-slate-400 hover:text-slate-900 p-1"><X className="w-5 h-5" /></button>
        </div>

        <Formik
          initialValues={{
            name: '',
            email: '',
            phone: '',
            password: 'password123',
            ...emptyPatientProfile,
          }}
          validationSchema={schema}
          onSubmit={async (values, { setSubmitting }) => {
            if (isSuperadmin && !hospitalId) {
              setError('Please select a hospital');
              setSubmitting(false);
              return;
            }
            setError('');
            const body = {
              name: values.name.trim(),
              email: values.email.trim(),
              password: values.password,
              role: patientRole,
              phone: withPrefix(values.phone),
              ...patientProfilePayload(values),
            };
            try {
              if (isSuperadmin) {
                await superadminPost('/users', hospitalId, body);
                toast.success('Patient added successfully');
                onSuccess();
                handleClose();
              } else {
                const created = await createUser(body).unwrap();
                toast.success('Patient added successfully');
                onSuccess();
                // Keep the modal open, on the "book an appointment?" step.
                setJustCreated({ id: created.id, name: body.name });
              }
            } catch (err) {
              setError(apiError(err, 'Failed to add patient'));
            } finally {
              setSubmitting(false);
            }
          }}
        >
          {({ isSubmitting, dirty }) => (
            <Form className="flex flex-col flex-1 min-h-0">
              <div className="px-6 py-5 space-y-6 overflow-y-auto flex-1">
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
                        onChange={(e) => setHospitalId(e.target.value)}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500"
                      >
                        <option value="">Select a hospital…</option>
                        {hospitals!.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
                      </select>
                    </div>
                  )
                )}

                <fieldset className="space-y-4">
                  <legend className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                    Account
                  </legend>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField name="name" label="Full Name" placeholder="e.g. Anita Desai" required />
                    <PhoneField name="phone" label="Phone" />
                    <FormField name="email" label="Email" type="email" placeholder="patient@email.com" />
                    <FormField name="password" label="Password" type="password" required />
                  </div>
                </fieldset>

                <PatientProfileFields requireDateOfBirth />

                {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
              </div>

              <div className="flex gap-3 px-6 py-4 border-t border-slate-100 shrink-0">
                <button type="button" onClick={handleClose} className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 text-sm font-medium transition">Cancel</button>
                <Button type="submit" disabled={isSubmitting || !dirty} variant="brand" className="flex-1">
                  {isSubmitting ? <Spinner size="sm" label="Adding…" /> : 'Add Patient'}
                </Button>
              </div>
            </Form>
          )}
        </Formik>
      </DialogContent>
    </Dialog>
  );
}
