'use client';

import { useState } from 'react';
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import { X, CalendarPlus, AlertCircle } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import type { Appointment } from '@/lib/types';
import { apiError } from '@/lib/apiError';
import {
  useCreateAppointmentMutation,
  useListAppointmentsQuery,
  useListConsultationFeesQuery,
  useListScheduleBlocksQuery,
} from '@/store/api';
import { PaymentModeField, type CounterPaymentMode } from '@/components/payments/PaymentModeField';
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
const SLOTS = [
  '09:00 AM', '09:30 AM', '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM',
  '12:00 PM', '01:00 PM', '02:00 PM', '02:30 PM', '03:00 PM', '03:30 PM',
  '04:00 PM', '04:30 PM',
];
type SlotStatus = 'available' | 'booked' | 'blocked';
function slotStatus(slot: string, date: string, booked: Set<string>, blocked: Set<string>, breakSlots: Set<string>): SlotStatus {
  if (breakSlots.has(slot) || blocked.has(slot)) return 'blocked';
  if (date === todayStr) {
    const now = new Date();
    if (slotToMinutes(slot) <= now.getHours() * 60 + now.getMinutes()) return 'blocked';
  }
  if (booked.has(slot)) return 'booked';
  return 'available';
}
function bookedSlotsFrom(appointments: Appointment[], doctorId: string, date: string) {
  if (!doctorId || !date) return new Set<string>();
  return new Set(
    appointments
      .filter((a) => a.doctorId === doctorId && a.date === date && a.status === 'scheduled')
      .map((a) => a.time),
  );
}

// The visit type a follow-up is billed at. Seeded for every hospital by
// pricing.seed_default_fees; a hospital that retired or never priced it gets a
// booking with no bill rather than one billed at the new-patient rate.
const FOLLOW_UP_VISIT_TYPE = 'follow_up';

// A default follow-up is a fortnight out — sensible starting point the user can change.
function defaultFollowUpDate() {
  return toDateStr(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000));
}

interface FollowUpFormValues {
  date: string;
  time: string;
  reason: string;
}

export function FollowUpModal({
  appointment,
  onClose,
  onCreated,
  hospitalId,
}: {
  appointment: Appointment;
  onClose: () => void;
  onCreated: (message: string) => void;
  hospitalId?: string;
}) {
  // Counter modes only: this is booked mid-consultation, with nobody at a
  // checkout screen. The bill is raised pending and settled at the desk.
  const [paymentMode, setPaymentMode] = useState<CounterPaymentMode>('cash');
  const [error, setError] = useState('');
  // Mirrors the form's date so the conflict check — a hook, and so cannot live
  // inside Formik's render prop — can react to it.
  const [selectedDate, setSelectedDate] = useState(defaultFollowUpDate());

  const [createAppointment] = useCreateAppointmentMutation();
  const { data: appointments = [], isLoading: loadingAppointments } = useListAppointmentsQuery({ doctorId: appointment.doctorId });
  const { data: blocks = [], isLoading: loadingBlocks } = useListScheduleBlocksQuery({ doctorId: appointment.doctorId });
  // Priced as a follow-up, not as a new patient — which is what this booking
  // used to be billed at, since it sent no visit type at all.
  const { data: fees = [] } = useListConsultationFeesQuery(hospitalId ? { hospitalId } : undefined);
  const followUpFee = fees.find((f) => f.visitType === FOLLOW_UP_VISIT_TYPE);
  const breakSlots = useBreakSlots(SLOTS);

  // Same one-booking-per-department-per-day rule the server enforces on
  // create — checked here too so picking a date that already collides is
  // caught before the rest of the form is filled in.
  const deptConflict = useDepartmentBookingConflict(
    appointment.patientId,
    appointment.departmentId,
    selectedDate,
  );

  const initialValues: FollowUpFormValues = {
    date: defaultFollowUpDate(),
    time: '',
    reason: `Follow-up: ${appointment.reason || 'Consultation'}`,
  };

  const schema = Yup.object({
    date: Yup.string().required('Pick a date'),
    time: Yup.string().required('Select a time slot'),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-lg shadow-2xl max-w-2xl w-full max-h-[92vh] overflow-y-auto">
        <div className="flex justify-between items-center px-6 py-4 border-b">
          <div className="flex items-center gap-2">
            <CalendarPlus className="w-5 h-5 text-cyan-600" />
            <h3 className="text-lg font-bold text-slate-900">Schedule Follow-Up</h3>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-900">
            <X className="w-5 h-5" />
          </button>
        </div>

        <Formik
          initialValues={initialValues}
          validationSchema={schema}
          onSubmit={async (values, { setSubmitting }) => {
            setError('');
            const booked = bookedSlotsFrom(appointments, appointment.doctorId, values.date);
            const blocked = blockedSlotSet(blocks, appointment.doctorId, values.date, SLOTS);
            if (slotStatus(values.time, values.date, booked, blocked, breakSlots) !== 'available') {
              setError('That slot is not available for this doctor');
              setSubmitting(false);
              return;
            }
            if (deptConflict) {
              setError('This patient already has an appointment in this department on this date.');
              setSubmitting(false);
              return;
            }
            try {
              await createAppointment({
                hospitalId,
                patientId: appointment.patientId,
                doctorId: appointment.doctorId,
                departmentId: appointment.departmentId,
                date: values.date,
                time: values.time,
                status: 'scheduled',
                visitType: FOLLOW_UP_VISIT_TYPE,
                reason: values.reason.trim() || 'Follow-up',
                notes: '',
                followUpOf: appointment.id,
                paymentMode,
              }).unwrap();
              onCreated('Follow-up scheduled');
            } catch (err) {
              setError(apiError(err, 'Could not schedule the follow-up'));
            } finally {
              setSubmitting(false);
            }
          }}
        >
          {({ values, setValues, setFieldValue, handleChange, isSubmitting, dirty }) => {
            const booked = bookedSlotsFrom(appointments, appointment.doctorId, values.date);
            const blocked = blockedSlotSet(blocks, appointment.doctorId, values.date, SLOTS);
            return (
              <Form>
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
                        This patient already has an appointment in this department on this date. Pick a different date.
                      </p>
                    </div>
                  )}

                  <div className="grid sm:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Date <span className="text-red-500">*</span></label>
                      <Calendar
                        mode="single"
                        selected={values.date ? new Date(`${values.date}T00:00:00`) : undefined}
                        onSelect={(d) => {
                          const ds = d ? toDateStr(d) : '';
                          setValues({ ...values, date: ds, time: '' });
                          setSelectedDate(ds);
                        }}
                        disabled={{ before: new Date(new Date().setHours(0, 0, 0, 0)) }}
                        className="[--cell-size:2rem] rounded-lg border border-slate-200 w-full max-w-full overflow-hidden"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Time slot <span className="text-red-500">*</span></label>
                      {!values.date ? (
                        <div className="min-h-[180px] flex items-center justify-center text-slate-400 text-sm border border-dashed border-slate-300 rounded-lg">Pick a date</div>
                      ) : loadingAppointments || loadingBlocks ? (
                        <Spinner variant="block" className="py-0 min-h-[180px] border border-dashed border-slate-300 rounded-lg" label="Checking availability…" />
                      ) : (
                        <div className="grid grid-cols-2 gap-2">
                          {SLOTS.map((slot) => {
                            const st = slotStatus(slot, values.date, booked, blocked, breakSlots);
                            const selected = values.time === slot && st === 'available';
                            const cls = selected
                              ? 'bg-cyan-600 text-white border-cyan-600'
                              : st === 'available'
                              ? 'bg-white text-slate-700 border-cyan-200 hover:border-cyan-500 hover:bg-cyan-50'
                              : st === 'booked'
                              ? 'bg-red-50 text-red-400 border-red-200 line-through cursor-not-allowed'
                              : 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed';
                            return (
                              <button key={slot} type="button" disabled={st !== 'available'} onClick={() => setFieldValue('time', slot)} className={`px-2 py-2 rounded-lg border text-sm font-medium transition ${cls}`}>
                                {slot}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Reason</label>
                    <textarea
                      name="reason"
                      value={values.reason}
                      onChange={handleChange}
                      rows={2}
                      className="w-full px-3 py-2 border border-slate-300 rounded focus:outline-none focus:border-cyan-500 resize-none"
                      placeholder="Reason for the follow-up visit"
                    />
                  </div>

                  <PaymentModeField
                    value={paymentMode}
                    onChange={setPaymentMode}
                    allowOnline={false}
                    note={
                      followUpFee && followUpFee.amount > 0
                        ? `₹${followUpFee.amount} (${followUpFee.label}) will be raised as a pending bill for the desk to collect.`
                        : 'No follow-up fee is configured for this hospital, so no bill will be raised.'
                    }
                  />
                </div>

                <div className="flex gap-3 px-6 py-4 border-t">
                  <button type="button" onClick={onClose} className="flex-1 px-4 py-2 bg-slate-200 text-slate-700 rounded hover:bg-slate-300 transition">
                    Cancel
                  </button>
                  <Button type="submit" disabled={isSubmitting || !dirty || deptConflict} variant="brand" className="flex-1">
                    {isSubmitting ? <Spinner size="sm" label="Saving…" /> : 'Schedule Follow-Up'}
                  </Button>
                </div>
              </Form>
            );
          }}
        </Formik>
      </div>
    </div>
  );
}
