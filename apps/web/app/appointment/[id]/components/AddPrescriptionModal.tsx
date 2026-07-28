'use client';

import { Formik, Form } from 'formik';
import { X } from 'lucide-react';
import { dbOperations } from '@/lib/db';
import { FormField } from '@/components/form/FormField';
import { Modal } from './Modal';
import { rxSchema } from '../appointmentSchemas';

interface AddPrescriptionModalProps {
  appointmentId: string;
  patientId: string;
  doctorId: string;
  medicineOptions: { value: string; label: string }[];
  onClose: () => void;
  onSaved: (msg: string) => void;
}

export function AddPrescriptionModal({
  appointmentId,
  patientId,
  doctorId,
  medicineOptions,
  onClose,
  onSaved,
}: AddPrescriptionModalProps) {
  return (
    <Modal maxWidth="max-w-lg" scroll>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-slate-900">Add Prescription</h2>
        <button onClick={onClose} className="text-slate-500 hover:text-slate-900">
          <X className="w-5 h-5" />
        </button>
      </div>
      <Formik
        initialValues={{ medicineName: '', dosage: '', frequency: '', duration: '', instructions: '' }}
        validationSchema={rxSchema}
        onSubmit={(values) => {
          dbOperations.createPrescription({
            id: `rx-${Date.now()}`,
            appointmentId,
            patientId,
            doctorId,
            medicineName: values.medicineName,
            dosage: values.dosage.trim(),
            frequency: values.frequency.trim(),
            duration: values.duration.trim(),
            instructions: values.instructions.trim(),
            createdAt: new Date().toISOString(),
          });
          onSaved('Prescription added');
        }}
      >
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
          <div className="sm:col-span-2 flex gap-3 pt-2">
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
              Save Prescription
            </button>
          </div>
        </Form>
      </Formik>
    </Modal>
  );
}
