'use client';

import { useState } from 'react';
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import { X, Ban, AlertCircle } from 'lucide-react';
import type { BlockType } from '@/lib/types';
import { apiError } from '@/lib/apiError';
import { useCreateScheduleBlockMutation } from '@/store/api';
import { BLOCK_TYPE_OPTIONS, GRID_SLOTS, slotMin } from '@/lib/schedule';
import { FormField } from '@/components/form/FormField';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';

// Start options exclude the last slot; end options exclude the first (end is exclusive).
const START_SLOTS = GRID_SLOTS.slice(0, -1);
const END_SLOTS = GRID_SLOTS.slice(1);

interface BlockFormValues {
  doctor: string;
  date: string;
  type: BlockType;
  start: string;
  end: string;
  note: string;
}

const schema = Yup.object({
  doctor: Yup.string().required('Select a doctor'),
  date: Yup.string().required('Pick a date'),
  end: Yup.string().test('after-start', 'End time must be after start time', function (end) {
    return slotMin(end ?? '') > slotMin(this.parent.start ?? '');
  }),
});

export function BlockModal({
  doctorId,
  doctorOptions,
  defaultDate,
  onClose,
  onCreated,
}: {
  doctorId?: string;
  doctorOptions?: { value: string; label: string }[];
  defaultDate: string;
  onClose: () => void;
  onCreated: (message: string) => void;
}) {
  const [createScheduleBlock] = useCreateScheduleBlockMutation();
  const [error, setError] = useState('');

  const initialValues: BlockFormValues = {
    doctor: doctorId ?? doctorOptions?.[0]?.value ?? '',
    date: defaultDate,
    type: 'break',
    start: '09:00 AM',
    end: '09:30 AM',
    note: '',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-lg shadow-2xl max-w-md w-full">
        <div className="flex justify-between items-center px-6 py-4 border-b">
          <div className="flex items-center gap-2">
            <Ban className="w-5 h-5 text-cyan-600" />
            <h3 className="text-lg font-bold text-slate-900">Block Time</h3>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-900"><X className="w-5 h-5" /></button>
        </div>

        <Formik
          initialValues={initialValues}
          validationSchema={schema}
          onSubmit={async (values, { setSubmitting }) => {
            setError('');
            try {
              await createScheduleBlock({
                doctorId: values.doctor,
                date: values.date,
                startTime: values.start,
                endTime: values.end,
                type: values.type,
                note: values.note.trim(),
              }).unwrap();
              onCreated('Block added to schedule');
            } catch (err) {
              setError(apiError(err, 'Could not add the block'));
            } finally {
              setSubmitting(false);
            }
          }}
        >
          {({ isSubmitting }) => (
            <Form>
              <div className="p-6 space-y-4">
                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                    <p className="text-red-700 text-sm">{error}</p>
                  </div>
                )}

                {doctorOptions && (
                  <FormField name="doctor" label="Doctor" as="select" options={doctorOptions} />
                )}

                <div className="grid grid-cols-2 gap-4">
                  <FormField name="date" label="Date" type="date" />
                  <FormField name="type" label="Type" as="select" options={BLOCK_TYPE_OPTIONS} />
                  <FormField
                    name="start"
                    label="From"
                    as="select"
                    options={START_SLOTS.map((s) => ({ value: s, label: s }))}
                  />
                  <FormField
                    name="end"
                    label="To"
                    as="select"
                    options={END_SLOTS.map((s) => ({ value: s, label: s }))}
                  />
                </div>

                <FormField name="note" label="Note (optional)" placeholder="e.g. Scheduled C-section" />
              </div>

              <div className="flex gap-3 px-6 py-4 border-t">
                <button type="button" onClick={onClose} className="flex-1 px-4 py-2 bg-slate-200 text-slate-700 rounded hover:bg-slate-300 transition">Cancel</button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  variant="brand"
                  className="flex-1"
                >
                  {isSubmitting ? <Spinner size="sm" label="Adding…" /> : 'Add Block'}
                </Button>
              </div>
            </Form>
          )}
        </Formik>
      </div>
    </div>
  );
}
