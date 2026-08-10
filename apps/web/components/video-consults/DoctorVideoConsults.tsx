'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Video, Plus, X, CalendarPlus, Clock, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import type { Appointment, VideoSlot } from '@/lib/types';
import { apiError } from '@/lib/apiError';
import {
  useCreateVideoSlotMutation,
  useDeleteVideoSlotMutation,
  useGetDoctorByUserQuery,
  useListAppointmentsQuery,
  useListPatientsQuery,
  useListVideoSlotsQuery,
} from '@/store/api';
import { DashboardShell } from '@/components/DashboardShell';
import type { RoleViewProps } from '@/components/RoleView';
import { GRID_SLOTS } from '@/lib/schedule';
import { fmtDate } from '@/lib/date';

const todayStr = () => new Date().toISOString().split('T')[0];

export function DoctorVideoConsults({ session }: RoleViewProps) {

  const [date, setDate] = useState(todayStr());
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const router = useRouter();
  const { data: doctor } = useGetDoctorByUserQuery(session.user.id);
  const doctorId = doctor?.id ?? '';

  const { data: slots = [] } = useListVideoSlotsQuery({ doctorId }, { skip: !doctorId });
  const { data: allAppointments = [] } = useListAppointmentsQuery();
  const { data: patients = [] } = useListPatientsQuery();
  const [createVideoSlot] = useCreateVideoSlotMutation();
  const [deleteVideoSlot] = useDeleteVideoSlotMutation();

  const appts = allAppointments.filter((a) => a.mode === 'video' && a.status === 'scheduled');

  const patientName = useMemo(
    () => new Map(patients.map((p) => [p.id, p.user?.name ?? p.id])),
    [patients],
  );

  // Times already published for the selected date (can't double-add).
  const takenForDate = new Set(slots.filter((s) => s.date === date).map((s) => s.time));

  const timeToMin = (t: string) => {
    const m = t.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (!m) return 0;
    let h = Number(m[1]);
    const mm = Number(m[2]);
    if (m[3].toUpperCase() === 'PM' && h !== 12) h += 12;
    if (m[3].toUpperCase() === 'AM' && h === 12) h = 0;
    return h * 60 + mm;
  };
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const isToday = date === todayStr();

  const toggle = (t: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      next.has(t) ? next.delete(t) : next.add(t);
      return next;
    });
  };

  const publish = async () => {
    if (!date || picked.size === 0) return;
    try {
      for (const time of picked) {
        await createVideoSlot({ doctorId, date, time, status: 'open' }).unwrap();
      }
      setPicked(new Set());
      toast.success('Slots published');
    } catch (err) {
      toast.error(apiError(err, 'Could not publish those slots'));
    }
  };

  const removeSlot = async (id: string) => {
    try {
      await deleteVideoSlot(id).unwrap();
    } catch (err) {
      toast.error(apiError(err, 'Could not remove the slot'));
    }
  };

  // Group slots by date for display — past dates are hidden.
  const today = todayStr();
  const byDate = slots.reduce<Record<string, VideoSlot[]>>((acc, s) => {
    if (s.date >= today) (acc[s.date] ??= []).push(s);
    return acc;
  }, {});
  const dates = Object.keys(byDate).sort();

  return (
    <DashboardShell
      role={session.user.role}
      userName={session.user.name}
      title="Video Consultations"
      subtitle="Publish your availability — patients book these slots online"
    >
      <div className="space-y-6">
        {/* Publish availability */}
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-2 mb-4">
            <CalendarPlus className="w-5 h-5 text-cyan-600" />
            <h2 className="text-sm font-semibold text-slate-900">Publish availability</h2>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-end gap-4">
            <label className="block">
              <span className="text-xs font-medium text-slate-600">Date</span>
              <input
                type="date"
                value={date}
                min={todayStr()}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500"
              />
            </label>
          </div>
          <p className="text-xs font-medium text-slate-600 mt-4 mb-2">Select time slots to offer</p>
          <div className="flex flex-wrap gap-2">
            {GRID_SLOTS.map((t) => {
              const taken = takenForDate.has(t);
              const past = isToday && timeToMin(t) <= nowMin;
              const disabled = taken || past;
              const on = picked.has(t);
              return (
                <button
                  key={t}
                  disabled={disabled}
                  onClick={() => toggle(t)}
                  className={`px-3 py-1.5 rounded-lg text-sm border transition ${
                    taken
                      ? 'bg-cyan-50 text-cyan-500 border-cyan-200 cursor-not-allowed'
                      : past
                      ? 'bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed line-through'
                      : on
                      ? 'bg-cyan-500 text-white border-cyan-500'
                      : 'bg-white text-slate-700 border-slate-300 hover:border-cyan-400'
                  }`}
                  title={taken ? 'Already published' : past ? 'Time has passed' : ''}
                >
                  {t}
                </button>
              );
            })}
          </div>
          <button
            onClick={publish}
            disabled={picked.size === 0}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-cyan-500 to-brand-teal text-white text-sm font-semibold px-4 py-2 shadow hover:opacity-95 disabled:opacity-40"
          >
            <Plus className="w-4 h-4" /> Publish {picked.size > 0 ? `${picked.size} slot${picked.size === 1 ? '' : 's'}` : 'slots'}
          </button>
        </section>

        {/* Upcoming video appointments */}
        <section>
          <h2 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
            <Video className="w-4 h-4 text-cyan-600" /> Upcoming video appointments
          </h2>
          {appts.length === 0 ? (
            <p className="text-sm text-slate-500">No video consultations booked yet.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {appts.map((a) => (
                <div key={a.id} className="rounded-xl border border-slate-200 bg-white p-4 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-900 flex items-center gap-2">
                      <UserRound className="w-4 h-4 text-slate-400" /> {patientName.get(a.patientId) ?? 'Patient'}
                    </p>
                    <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" /> {fmtDate(a.date)} · {a.time}
                    </p>
                  </div>
                  <button
                    onClick={() => router.push(`/dashboard/consult/${a.id}`)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-brand-teal text-white text-sm font-semibold px-3 py-1.5"
                  >
                    <Video className="w-4 h-4" /> Join
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Published slots */}
        <section>
          <h2 className="text-sm font-semibold text-slate-900 mb-3">Published slots</h2>
          {dates.length === 0 ? (
            <p className="text-sm text-slate-500">No slots published yet. Add some availability above.</p>
          ) : (
            <div className="space-y-3">
              {dates.map((d) => (
                <div key={d} className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-sm font-medium text-slate-700 mb-2">
                    {new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {byDate[d]
                      .sort((a, b) => a.time.localeCompare(b.time))
                      .map((s) => (
                        <span
                          key={s.id}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm ${
                            s.status === 'booked'
                              ? 'bg-cyan-50 text-cyan-700 border border-cyan-200'
                              : 'bg-slate-50 text-slate-700 border border-slate-200'
                          }`}
                        >
                          {s.time}
                          {s.status === 'booked' ? (
                            <span className="text-xs text-cyan-600">· Booked</span>
                          ) : (
                            <button onClick={() => removeSlot(s.id)} className="text-slate-400 hover:text-red-500" aria-label="Remove slot">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </span>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </DashboardShell>
  );
}
