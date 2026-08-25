'use client';

import { Formik, Form } from 'formik';
import { X } from 'lucide-react';
import { apiError } from '@/lib/apiError';
import { useUpdateVitalsMutation } from '@/store/api';
import { FormField } from '@/components/form/FormField';
import { Modal } from './Modal';
import { vitalsSchema } from '../appointmentSchemas';
import type { Vitals } from '@/lib/types';

interface Props {
  vitals: Vitals;
  onClose: () => void;
  onSaved: (msg: string) => void;
}

export function EditVitalsModal({ vitals, onClose, onSaved }: Props) {
  const [updateVitals] = useUpdateVitalsMutation();

  return (
    <Modal maxWidth="max-w-lg" scroll>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-slate-900">Edit Vitals</h2>
        <button onClick={onClose} className="text-slate-500 hover:text-slate-900">
          <X className="w-5 h-5" />
        </button>
      </div>
      <Formik
        initialValues={{
          temperature: vitals.temperature ? String(vitals.temperature) : '',
          bloodPressure: vitals.bloodPressure ?? '',
          heartRate: vitals.heartRate ? String(vitals.heartRate) : '',
          respiratoryRate: vitals.respiratoryRate ? String(vitals.respiratoryRate) : '',
          weight: vitals.weight ? String(vitals.weight) : '',
          height: vitals.height ? String(vitals.height) : '',
          notes: vitals.notes ?? '',
        }}
        validationSchema={vitalsSchema}
        onSubmit={async (values, { setSubmitting, setStatus }) => {
          setStatus('');
          try {
            await updateVitals({
              id: vitals.id,
              body: {
                temperature: Number(values.temperature) || 0,
                bloodPressure: values.bloodPressure,
                heartRate: Number(values.heartRate) || 0,
                respiratoryRate: Number(values.respiratoryRate) || 0,
                weight: Number(values.weight) || 0,
                height: Number(values.height) || 0,
                notes: values.notes,
              },
            }).unwrap();
            onSaved('Vitals updated');
          } catch (err) {
            setStatus(apiError(err, 'Could not update vitals'));
          } finally {
            setSubmitting(false);
          }
        }}
      >
        {({ status }) => (
          <Form className="grid grid-cols-2 gap-4">
            <FormField name="temperature" label="Temperature (°C)" type="number" placeholder="36.8" />
            <FormField name="bloodPressure" label="Blood Pressure" placeholder="120/80" />
            <FormField name="heartRate" label="Heart Rate (bpm)" type="number" placeholder="78" />
            <FormField name="respiratoryRate" label="Respiratory Rate (/min)" type="number" placeholder="16" />
            <FormField name="weight" label="Weight (kg)" type="number" placeholder="68" />
            <FormField name="height" label="Height (cm)" type="number" placeholder="165" />
            <div className="col-span-2">
              <FormField name="notes" label="Notes" as="textarea" placeholder="Any observations" rows={2} />
            </div>
            {status && (
              <p className="col-span-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{status}</p>
            )}
            <div className="col-span-2 flex gap-3 pt-2">
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
