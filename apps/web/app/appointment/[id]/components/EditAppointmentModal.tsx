'use client';

import { useState } from 'react';

import { Formik, Form } from 'formik';
import { X } from 'lucide-react';
import type { Appointment } from '@/lib/types';
import { apiError } from '@/lib/apiError';
import { useUpdateAppointmentMutation } from '@/store/api';
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
  const [updateAppointment] = useUpdateAppointmentMutation();
  const [error, setError] = useState('');

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
        onSubmit={async (values) => {
          try {
            await updateAppointment({
              id: appointmentId,
              body: {
                status: values.status as Appointment['status'],
                reason: values.reason,
              },
            }).unwrap();
          } catch (err) {
            setError(apiError(err, 'Failed to save changes'));
            return;
          }
          onSaved('Appointment updated');
        }}
      >
        <Form className="space-y-4">
          <FormField name="status" label="Status" as="select" placeholder="Select status" options={statusOptions} required />
          <FormField name="reason" label="Reason" as="textarea" placeholder="Reason for visit" rows={3} />
          {error && (
            <p className="col-span-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}
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
