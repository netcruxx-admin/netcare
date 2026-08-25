'use client';

import { useState } from 'react';
import { X, CalendarPlus, AlertCircle } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Spinner } from '@/components/ui/spinner';
import type { Appointment } from '@/lib/types';
import { apiError } from '@/lib/apiError';
import {
  useCreateAppointmentMutation,
  useListAppointmentsQuery,
  useListScheduleBlocksQuery,
} from '@/store/api';
import { blockedSlotSet } from '@/lib/schedule';
import { useBreakSlots } from '@/hooks/useBreakSlots';

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

// A default follow-up is a fortnight out — sensible starting point the user can change.
function defaultFollowUpDate() {
  return toDateStr(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000));
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
  const [date, setDate] = useState(defaultFollowUpDate());
  const [time, setTime] = useState('');
  const [reason, setReason] = useState(`Follow-up: ${appointment.reason || 'Consultation'}`);
  const [error, setError] = useState('');

  const [createAppointment] = useCreateAppointmentMutation();
  const { data: appointments = [], isLoading: loadingAppointments } = useListAppointmentsQuery({ doctorId: appointment.doctorId });
  const { data: blocks = [], isLoading: loadingBlocks } = useListScheduleBlocksQuery({ doctorId: appointment.doctorId });

  const booked = bookedSlotsFrom(appointments, appointment.doctorId, date);
  const blocked = blockedSlotSet(blocks, appointment.doctorId, date, SLOTS);
  const breakSlots = useBreakSlots(SLOTS);

  const save = async () => {
    setError('');
    if (!date) return setError('Pick a date');
    if (!time) return setError('Select a time slot');
    if (slotStatus(time, date, booked, blocked, breakSlots) !== 'available') return setError('That slot is not available for this doctor');

    try {
      await createAppointment({
        hospitalId,
        patientId: appointment.patientId,
        doctorId: appointment.doctorId,
        departmentId: appointment.departmentId,
        date,
        time,
        status: 'scheduled',
        reason: reason.trim() || 'Follow-up',
        notes: '',
        followUpOf: appointment.id,
      }).unwrap();
      onCreated('Follow-up scheduled');
    } catch (err) {
      setError(apiError(err, 'Could not schedule the follow-up'));
    }
  };

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

        <div className="p-6 space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Date <span className="text-red-500">*</span></label>
              <Calendar
                mode="single"
                selected={date ? new Date(`${date}T00:00:00`) : undefined}
                onSelect={(d) => { setDate(d ? toDateStr(d) : ''); setTime(''); }}
                disabled={{ before: new Date(new Date().setHours(0, 0, 0, 0)) }}
                className="[--cell-size:2rem] rounded-lg border border-slate-200 w-full max-w-full overflow-hidden"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Time slot <span className="text-red-500">*</span></label>
              {!date ? (
                <div className="min-h-[180px] flex items-center justify-center text-slate-400 text-sm border border-dashed border-slate-300 rounded-lg">Pick a date</div>
              ) : loadingAppointments || loadingBlocks ? (
                <Spinner variant="block" className="py-0 min-h-[180px] border border-dashed border-slate-300 rounded-lg" label="Checking availability…" />
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {SLOTS.map((slot) => {
                    const st = slotStatus(slot, date, booked, blocked, breakSlots);
                    const selected = time === slot && st === 'available';
                    const cls = selected
                      ? 'bg-cyan-600 text-white border-cyan-600'
                      : st === 'available'
                      ? 'bg-white text-slate-700 border-cyan-200 hover:border-cyan-500 hover:bg-cyan-50'
                      : st === 'booked'
                      ? 'bg-red-50 text-red-400 border-red-200 line-through cursor-not-allowed'
                      : 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed';
                    return (
                      <button key={slot} type="button" disabled={st !== 'available'} onClick={() => setTime(slot)} className={`px-2 py-2 rounded-lg border text-sm font-medium transition ${cls}`}>
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
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-slate-300 rounded focus:outline-none focus:border-cyan-500 resize-none"
              placeholder="Reason for the follow-up visit"
            />
          </div>
        </div>

        <div className="flex gap-3 px-6 py-4 border-t">
          <button onClick={onClose} className="flex-1 px-4 py-2 bg-slate-200 text-slate-700 rounded hover:bg-slate-300 transition">
            Cancel
          </button>
          <button onClick={save} className="flex-1 px-4 py-2 bg-gradient-to-r from-cyan-500 to-brand-teal text-white rounded hover:shadow-lg font-semibold transition">
            Schedule Follow-Up
          </button>
        </div>
      </div>
    </div>
  );
}
