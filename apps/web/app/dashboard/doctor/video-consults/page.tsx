'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Video, Plus, X, CalendarPlus, Clock, UserRound } from 'lucide-react';
import { authStorage } from '@/lib/auth';
import { dbOperations, type Appointment, type VideoSlot } from '@/lib/db';
import { DashboardShell } from '@/components/DashboardShell';
import { GRID_SLOTS } from '@/lib/schedule';

const todayStr = () => new Date().toISOString().split('T')[0];

export default function DoctorVideoConsultsPage() {
  const router = useRouter();
  const [session, setSession] = useState<ReturnType<typeof authStorage.getSession>>(null);
  const [doctorId, setDoctorId] = useState('');
  const [slots, setSlots] = useState<VideoSlot[]>([]);
  const [appts, setAppts] = useState<Appointment[]>([]);

  const [date, setDate] = useState(todayStr());
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const refresh = (docId: string) => {
    setSlots([...dbOperations.getVideoSlotsByDoctorId(docId)]);
    setAppts(
      dbOperations.getAppointmentsByDoctorId(docId).filter((a) => a.mode === 'video' && a.status === 'scheduled'),
    );
  };

  useEffect(() => {
    const s = authStorage.getSession();
    if (!s || s.user.role !== 'doctor') {
      router.push('/login');
      return;
    }
    setSession(s);
    const docId = dbOperations.getDoctorByUserId(s.user.id)?.id ?? '';
    setDoctorId(docId);
    if (docId) refresh(docId);
  }, [router]);

  const patientName = useMemo(() => {
    const users = new Map(dbOperations.getAllUsers().map((u) => [u.id, u.name]));
    const map = new Map<string, string>();
    dbOperations.getAllPatients().forEach((p) => map.set(p.id, users.get(p.userId) ?? p.id));
    return map;
  }, [slots, appts]);

  if (!session) return null;

  // Times already published for the selected date (can't double-add).
  const takenForDate = new Set(slots.filter((s) => s.date === date).map((s) => s.time));

  const toggle = (t: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      next.has(t) ? next.delete(t) : next.add(t);
      return next;
    });
  };

  const publish = () => {
    if (!date || picked.size === 0) return;
    [...picked].forEach((time, i) => {
      dbOperations.createVideoSlot({
        id: `vs-${Date.now()}-${i}`,
        doctorId,
        date,
        time,
        status: 'open',
        createdAt: new Date().toISOString(),
      });
    });
    setPicked(new Set());
    refresh(doctorId);
  };

  const removeSlot = (id: string) => {
    dbOperations.deleteVideoSlot(id);
    refresh(doctorId);
  };

  // Group slots by date for display.
  const byDate = slots.reduce<Record<string, VideoSlot[]>>((acc, s) => {
    (acc[s.date] ??= []).push(s);
    return acc;
  }, {});
  const dates = Object.keys(byDate).sort();

  return (
    <DashboardShell
      role="doctor"
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
              const on = picked.has(t);
              return (
                <button
                  key={t}
                  disabled={taken}
                  onClick={() => toggle(t)}
                  className={`px-3 py-1.5 rounded-lg text-sm border transition ${
                    taken
                      ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                      : on
                      ? 'bg-cyan-500 text-white border-cyan-500'
                      : 'bg-white text-slate-700 border-slate-300 hover:border-cyan-400'
                  }`}
                  title={taken ? 'Already published' : ''}
                >
                  {t}
                </button>
              );
            })}
          </div>
          <button
            onClick={publish}
            disabled={picked.size === 0}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-cyan-500 to-teal-600 text-white text-sm font-semibold px-4 py-2 shadow hover:opacity-95 disabled:opacity-40"
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
                      <UserRound className="w-4 h-4 text-slate-400" /> {patientName.get(a.patientId) ?? a.patientId}
                    </p>
                    <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" /> {a.date} · {a.time}
                    </p>
                  </div>
                  <button
                    onClick={() => router.push(`/dashboard/consult/${a.id}`)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-teal-600 text-white text-sm font-semibold px-3 py-1.5"
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
