'use client';

import { useState } from 'react';
import { useFormik } from 'formik';
import { X, CalendarClock, AlertCircle } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import type { Appointment } from '@/lib/types';
import { apiError } from '@/lib/apiError';
import { useListAppointmentsQuery, useListScheduleBlocksQuery, useUpdateAppointmentMutation } from '@/store/api';
import { blockedSlotSet } from '@/lib/schedule';
import { useBreakSlots } from '@/hooks/useBreakSlots';
import { useDepartmentBookingConflict } from '@/hooks/useDepartmentBookingConflict';

function toDateStr(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function slotToMinutes(slot: string) {
  const [t, mer] = slot.split(' ');
  let [h, m] = t.split(':').map(Number);
  if (mer === 'PM' && h !== 12) h += 12;
  if (mer === 'AM' && h === 12) h = 0;
  return h * 60 + m;
}

const todayStr = toDateStr(new Date());
// Same fixed slot grid as the appointment boards' reschedule dialogs
// (AdminAppointments/PlatformAppointments) and FollowUpModal — one grid,
// not derived per-hospital, for a staff-facing reschedule.
const SLOTS = [
  '09:00 AM', '09:30 AM', '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM',
  '12:00 PM', '01:00 PM', '02:00 PM', '02:30 PM', '03:00 PM', '03:30 PM',
  '04:00 PM', '04:30 PM',
];
type SlotStatus = 'available' | 'booked' | 'blocked';
function slotStatus(slot: string, date: string, booked: Set<string>, blocked: Set<string>, breakSlots: Set<string>): SlotStatus {
  if (breakSlots.has(slot) || blocked.has(slot)) return 'blocked';
  // A whole day already gone — not just a past time today. YYYY-MM-DD
  // strings sort lexicographically the same as the dates they name, so a
  // plain string compare is enough.
  if (date < todayStr) return 'blocked';
  if (date === todayStr) {
    const now = new Date();
    if (slotToMinutes(slot) <= now.getHours() * 60 + now.getMinutes()) return 'blocked';
  }
  if (booked.has(slot)) return 'booked';
  return 'available';
}
// Excludes the appointment being rescheduled itself — otherwise its own
// current slot would show as taken.
function bookedSlotsForDoctor(appointments: Appointment[], doctorId: string, date: string, excludeId: string) {
  if (!doctorId || !date) return new Set<string>();
  return new Set(
    appointments
      .filter((a) => a.doctorId === doctorId && a.date === date && a.status === 'scheduled' && a.id !== excludeId)
      .map((a) => a.time),
  );
}

interface RescheduleFormValues {
  date: string;
  time: string;
}

export function RescheduleModal({
  appointment,
  onClose,
  onRescheduled,
}: {
  appointment: Appointment;
  onClose: () => void;
  onRescheduled: (message: string) => void;
}) {
  const [error, setError] = useState('');
  const [updateAppointment] = useUpdateAppointmentMutation();
  const { data: appointments = [] } = useListAppointmentsQuery({ doctorId: appointment.doctorId });
  const { data: blocks = [] } = useListScheduleBlocksQuery({ doctorId: appointment.doctorId });
  const breakSlots = useBreakSlots(SLOTS);

  const formik = useFormik<RescheduleFormValues>({
    // Opens on today, not the appointment's current date — pre-filling the
    // original value let it sit next to (or, if that date had already
    // passed, silently stand in for) "today" with no visual difference,
    // which is how a reschedule could go through for the original date at a
    // newly-picked time without the user ever noticing the date hadn't moved.
    initialValues: { date: todayStr, time: '' },
    onSubmit: async (values, { setSubmitting }) => {
      setError('');
      const booked = bookedSlotsForDoctor(appointments, appointment.doctorId, values.date, appointment.id);
      const blocked = blockedSlotSet(blocks, appointment.doctorId, values.date, SLOTS);
      if (slotStatus(values.time, values.date, booked, blocked, breakSlots) !== 'available') {
        setError('That slot is not available for this doctor.');
        setSubmitting(false);
        return;
      }
      try {
        await updateAppointment({
          id: appointment.id,
          body: { date: values.date, time: values.time },
        }).unwrap();
        onRescheduled('Appointment rescheduled');
      } catch (err) {
        setError(apiError(err, 'Could not reschedule the appointment'));
      } finally {
        setSubmitting(false);
      }
    },
  });

  const booked = bookedSlotsForDoctor(appointments, appointment.doctorId, formik.values.date, appointment.id);
  const blocked = blockedSlotSet(blocks, appointment.doctorId, formik.values.date, SLOTS);
  const unchanged = formik.values.date === appointment.date && formik.values.time === appointment.time;

  // Same one-booking-per-department-per-day rule the server enforces —
  // excluding this appointment itself, since it's already a live booking in
  // that department and would otherwise always read as its own conflict.
  const deptConflict = useDepartmentBookingConflict(
    appointment.patientId,
    appointment.departmentId,
    formik.values.date,
    appointment.id,
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-lg shadow-2xl max-w-2xl w-full max-h-[92vh] overflow-y-auto">
        <div className="flex justify-between items-center px-6 py-4 border-b">
          <div className="flex items-center gap-2">
            <CalendarClock className="w-5 h-5 text-cyan-600" />
            <h3 className="text-lg font-bold text-slate-900">Reschedule Appointment</h3>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-900">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}
          {!error && deptConflict && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-amber-800 text-sm">
                This patient already has another appointment in this department on this date. Pick a different date.
              </p>
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Date</label>
              <Calendar
                mode="single"
                selected={formik.values.date ? new Date(`${formik.values.date}T00:00:00`) : undefined}
                onSelect={(d) => formik.setValues({ date: d ? toDateStr(d) : '', time: '' })}
                disabled={{ before: new Date(new Date().setHours(0, 0, 0, 0)) }}
                // Unlike a fresh booking calendar, this one opens with a real
                // date already selected (the appointment's current date). The
                // Calendar's default "today" highlight is styled distinctly
                // enough for an empty calendar, but next to an actual
                // selection it reads as a second candidate date — someone
                // could pick a time assuming today is what's chosen, submit,
                // and silently keep the original date with only the time
                // changed. Suppressed here so the selected date is the only
                // thing marked.
                classNames={{ today: '' }}
                className="[--cell-size:2rem] rounded-lg border border-slate-200 w-full max-w-full overflow-hidden"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Time slot</label>
              {!formik.values.date ? (
                <div className="min-h-[180px] flex items-center justify-center text-slate-400 text-sm border border-dashed border-slate-300 rounded-lg">
                  Pick a date
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {SLOTS.map((slot) => {
                    const st = slotStatus(slot, formik.values.date, booked, blocked, breakSlots);
                    const selected = formik.values.time === slot && st === 'available';
                    const cls = selected
                      ? 'bg-cyan-600 text-white border-cyan-600'
                      : st === 'available'
                      ? 'bg-white text-slate-700 border-cyan-200 hover:border-cyan-500 hover:bg-cyan-50'
                      : st === 'booked'
                      ? 'bg-red-50 text-red-400 border-red-200 line-through cursor-not-allowed'
                      : 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed';
                    return (
                      <button
                        key={slot}
                        type="button"
                        disabled={st !== 'available'}
                        onClick={() => formik.setFieldValue('time', slot)}
                        className={`px-2 py-2 rounded-lg border text-sm font-medium transition ${cls}`}
                      >
                        {slot}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex gap-3 px-6 py-4 border-t">
          <button
            type="button"
            onClick={onClose}
            disabled={formik.isSubmitting}
            className="flex-1 px-4 py-2 bg-slate-200 text-slate-700 rounded hover:bg-slate-300 transition disabled:opacity-50"
          >
            Cancel
          </button>
          <Button
            onClick={() => formik.submitForm()}
            disabled={!formik.values.date || !formik.values.time || unchanged || formik.isSubmitting || deptConflict}
            variant="brand"
            className="flex-1"
          >
            {formik.isSubmitting ? <Spinner size="sm" label="Saving…" /> : 'Reschedule'}
          </Button>
        </div>
      </div>
    </div>
  );
}
