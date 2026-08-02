'use client';

import { useState } from 'react';
import { Formik, Form } from 'formik';
import { AlertCircle } from 'lucide-react';
import type { Appointment } from '@/lib/types';
import { apiError } from '@/lib/apiError';
import { useUpdateAppointmentMutation } from '@/store/api';
import { FormField } from '@/components/form/FormField';
import { Modal } from './Modal';
import { rescheduleSchema, timeSlots, today } from '../appointmentSchemas';

interface RescheduleModalProps {
  appointment: Appointment;
  appointmentId: string;
  onClose: () => void;
  onSaved: () => void;
}

export function RescheduleModal({ appointment, appointmentId, onClose, onSaved }: RescheduleModalProps) {
  const [updateAppointment] = useUpdateAppointmentMutation();
  const [error, setError] = useState('');

  return (
    <Modal>
      <div className="space-y-5">
        <h2 className="text-xl font-bold text-slate-900">Reschedule Appointment</h2>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        <Formik
          initialValues={{ date: appointment.date, time: appointment.time }}
          validationSchema={rescheduleSchema}
          onSubmit={async (values, { setSubmitting }) => {
            try {
              await updateAppointment({
                id: appointmentId,
                body: { date: values.date, time: values.time },
              }).unwrap();
              onSaved();
            } catch (err) {
              setError(apiError(err, 'Failed to reschedule. Please try again.'));
            } finally {
              setSubmitting(false);
            }
          }}
        >
          {({ isSubmitting }) => (
            <Form className="space-y-4">
              <FormField name="date" label="New Date" type="date" min={today} required />
              <FormField name="time" label="New Time" as="select" placeholder="Select Time" options={timeSlots} required />
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
                  disabled={isSubmitting}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-cyan-500 to-brand-teal text-white rounded-lg hover:shadow-lg transition font-semibold disabled:opacity-50"
                >
                  Reschedule
                </button>
              </div>
            </Form>
          )}
        </Formik>
      </div>
    </Modal>
  );
}
