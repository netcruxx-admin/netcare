'use client';

import { X } from 'lucide-react';
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import { toast } from 'sonner';
import { FormField } from '@/components/form/FormField';
import { PhoneField, toPhoneDigits, withPrefix } from '@/components/form/PhoneField';
import { apiError } from '@/lib/apiError';
import { useUpdatePatientMutation } from '@/store/api';
import type { Patient } from '@/lib/types';
import { Spinner } from '@/components/ui/spinner';

const GENDER_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
];

const BLOOD_GROUP_OPTIONS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((b) => ({
  value: b,
  label: b,
}));

const editSchema = Yup.object({
  gender: Yup.string(),
  bloodGroup: Yup.string().max(10, 'Too long'),
  dateOfBirth: Yup.string(),
  emergencyContact: Yup.string().max(100, 'Too long'),
  emergencyPhone: Yup.string().test('phone', 'Enter a valid 10-digit mobile number', (v) => !v || /^\d{10}$/.test(v)),
  allergies: Yup.string().max(300, 'Too long'),
  chronicDiseases: Yup.string().max(300, 'Too long'),
});

interface Props {
  /** Patient to edit. Pass null to close the modal. */
  patient: Patient | null;
  onClose: () => void;
  onSuccess: () => void;
  /** Superadmin-only: routes the request to the correct tenant. */
  hospitalId?: string;
}

export function EditPatientModal({ patient, onClose, onSuccess, hospitalId }: Props) {
  const [updatePatient] = useUpdatePatientMutation();

  if (!patient) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-2xl max-w-lg w-full max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 shrink-0">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Edit Patient</h3>
            <p className="text-xs text-slate-400">{patient.user?.name}</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-900">
            <X className="w-5 h-5" />
          </button>
        </div>
        <Formik
          initialValues={{
            gender: (patient.gender ?? '').toLowerCase(),
            bloodGroup: patient.bloodGroup ?? '',
            dateOfBirth: patient.dateOfBirth ?? '',
            emergencyContact: patient.emergencyContact ?? '',
            emergencyPhone: toPhoneDigits(patient.emergencyPhone ?? ''),
            allergies: patient.allergies ?? '',
            chronicDiseases: patient.chronicDiseases ?? '',
          }}
          validationSchema={editSchema}
          onSubmit={async (values, { setSubmitting, setStatus }) => {
            setStatus('');
            try {
              await updatePatient({
                id: patient.id,
                body: { ...values, emergencyPhone: withPrefix(values.emergencyPhone) },
                hospitalId,
              }).unwrap();
              toast.success('Patient updated');
              onSuccess();
              onClose();
            } catch (err) {
              setStatus(apiError(err, 'Failed to save patient'));
            } finally {
              setSubmitting(false);
            }
          }}
        >
          {({ isSubmitting, status }) => (
            <Form className="flex flex-col flex-1 min-h-0">
              <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    name="gender"
                    label="Gender"
                    as="select"
                    options={GENDER_OPTIONS}
                    placeholder="Select gender"
                  />
                  <FormField
                    name="bloodGroup"
                    label="Blood Group"
                    as="select"
                    options={BLOOD_GROUP_OPTIONS}
                    placeholder="Select blood group"
                  />
                </div>
                <FormField name="dateOfBirth" label="Date of Birth" type="date" />
                <div className="grid grid-cols-2 gap-4">
                  <FormField name="emergencyContact" label="Emergency Contact" placeholder="Contact name" />
                  <PhoneField name="emergencyPhone" label="Emergency Phone" />
                </div>
                <FormField name="allergies" label="Allergies" as="textarea" placeholder="Known allergies" />
                <FormField name="chronicDiseases" label="Chronic Diseases" as="textarea" placeholder="Chronic conditions" />
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
