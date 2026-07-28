'use client';

import { Formik, Form } from 'formik';
import { X } from 'lucide-react';
import type { Appointment } from '@/lib/db';
import { dbOperations } from '@/lib/db';
import { FormField } from '@/components/form/FormField';
import { Modal } from './Modal';
import { editSchema, statusOptions } from '../appointmentSchemas';

interface EditAppointmentModalProps {
  appointment: Appointment;
  appointmentId: string;
  onClose: () => void;
  onSaved: (msg: string) => void;
}

export function EditAppointmentModal({ appointment, appointmentId, onClose, onSaved }: EditAppointmentModalProps) {
  return (
    <Modal>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-slate-900">Edit Appointment</h2>
        <button onClick={onClose} className="text-slate-500 hover:text-slate-900">
          <X className="w-5 h-5" />
        </button>
      </div>
      <Formik
        initialValues={{ status: appointment.status, reason: appointment.reason }}
        validationSchema={editSchema}
        onSubmit={(values) => {
          dbOperations.updateAppointment(appointmentId, {
            status: values.status as Appointment['status'],
            reason: values.reason,
          });
          onSaved('Appointment updated');
        }}
      >
        <Form className="space-y-4">
          <FormField name="status" label="Status" as="select" placeholder="Select status" options={statusOptions} required />
          <FormField name="reason" label="Reason" as="textarea" placeholder="Reason for visit" rows={3} />
          <div className="flex gap-3 pt-2">
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
              Save Changes
            </button>
          </div>
        </Form>
      </Formik>
    </Modal>
  );
}
