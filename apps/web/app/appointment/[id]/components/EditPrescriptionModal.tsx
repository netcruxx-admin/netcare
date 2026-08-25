'use client';

import { Formik, Form } from 'formik';
import { X } from 'lucide-react';
import { apiError } from '@/lib/apiError';
import { useUpdatePrescriptionMutation } from '@/store/api';
import { FormField } from '@/components/form/FormField';
import { Modal } from './Modal';
import { rxSchema } from '../appointmentSchemas';
import type { Prescription } from '@/lib/types';

interface Props {
  prescription: Prescription;
  medicineOptions: { value: string; label: string }[];
  onClose: () => void;
  onSaved: (msg: string) => void;
}

export function EditPrescriptionModal({ prescription, medicineOptions, onClose, onSaved }: Props) {
  const [updatePrescription] = useUpdatePrescriptionMutation();

  return (
    <Modal maxWidth="max-w-lg" scroll>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-slate-900">Edit Prescription</h2>
        <button onClick={onClose} className="text-slate-500 hover:text-slate-900">
          <X className="w-5 h-5" />
        </button>
      </div>
      <Formik
        initialValues={{
          medicineName: prescription.medicineName ?? '',
          dosage: prescription.dosage ?? '',
          frequency: prescription.frequency ?? '',
          duration: prescription.duration ?? '',
          instructions: prescription.instructions ?? '',
        }}
        validationSchema={rxSchema}
        onSubmit={async (values, { setSubmitting, setStatus }) => {
          setStatus('');
          try {
            await updatePrescription({
              id: prescription.id,
              body: {
                medicineName: values.medicineName,
                dosage: values.dosage.trim(),
                frequency: values.frequency.trim(),
                duration: values.duration.trim(),
                instructions: values.instructions.trim(),
              },
            }).unwrap();
            onSaved('Prescription updated');
          } catch (err) {
            setStatus(apiError(err, 'Could not update prescription'));
          } finally {
            setSubmitting(false);
          }
        }}
      >
        {({ status }) => (
          <Form className="grid sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <FormField name="medicineName" label="Medicine" as="select" placeholder="Select a medicine" options={medicineOptions} required />
            </div>
            <FormField name="dosage" label="Dosage" placeholder="e.g. 500 mg" required />
            <FormField name="frequency" label="Frequency" placeholder="e.g. Twice a day" required />
            <FormField name="duration" label="Duration" placeholder="e.g. 5 days" required />
            <div className="hidden sm:block" />
            <div className="sm:col-span-2">
              <FormField name="instructions" label="Instructions" as="textarea" placeholder="e.g. After meals" rows={2} />
            </div>
            {status && (
              <p className="col-span-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{status}</p>
            )}
            <div className="sm:col-span-2 flex gap-3 pt-2">
              <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition">
                Cancel
              </button>
              <button type="submit" className="flex-1 px-4 py-2 bg-gradient-to-r from-cyan-500 to-brand-teal text-white rounded-lg hover:shadow-lg font-semibold transition">
                Save Changes
              </button>
            </div>
          </Form>
        )}
      </Formik>
    </Modal>
  );
}
