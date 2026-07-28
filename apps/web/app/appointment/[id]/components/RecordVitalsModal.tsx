'use client';

import { Formik, Form } from 'formik';
import { X } from 'lucide-react';
import { dbOperations } from '@/lib/db';
import { FormField } from '@/components/form/FormField';
import { Modal } from './Modal';
import { vitalsSchema } from '../appointmentSchemas';

interface RecordVitalsModalProps {
  appointmentId: string;
  patientId: string;
  doctorId: string;
  onClose: () => void;
  onSaved: (msg: string) => void;
}

export function RecordVitalsModal({ appointmentId, patientId, doctorId, onClose, onSaved }: RecordVitalsModalProps) {
  return (
    <Modal maxWidth="max-w-lg" scroll>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-slate-900">Record Vitals</h2>
        <button onClick={onClose} className="text-slate-500 hover:text-slate-900">
          <X className="w-5 h-5" />
        </button>
      </div>
      <Formik
        initialValues={{ temperature: '', bloodPressure: '', heartRate: '', respiratoryRate: '', weight: '', height: '', notes: '' }}
        validationSchema={vitalsSchema}
        onSubmit={(values) => {
          dbOperations.createVitals({
            id: `v-${Date.now()}`,
            appointmentId,
            patientId,
            doctorId,
            temperature: Number(values.temperature) || 0,
            bloodPressure: values.bloodPressure,
            heartRate: Number(values.heartRate) || 0,
            respiratoryRate: Number(values.respiratoryRate) || 0,
            weight: Number(values.weight) || 0,
            height: Number(values.height) || 0,
            notes: values.notes,
            createdAt: new Date().toISOString(),
          });
          onSaved('Vitals recorded');
        }}
      >
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
          <div className="col-span-2 flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-gradient-to-r from-cyan-500 to-teal-600 text-white rounded-lg hover:shadow-lg font-semibold transition"
            >
              Save Vitals
            </button>
          </div>
        </Form>
      </Formik>
    </Modal>
  );
}
