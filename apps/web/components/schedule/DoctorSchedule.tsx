'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, CalendarRange, Ban, X } from 'lucide-react';
import type { ScheduleBlock } from '@/lib/types';
import { apiError } from '@/lib/apiError';
import {
  useDeleteScheduleBlockMutation,
  useGetDoctorByUserQuery,
  useListAppointmentsQuery,
  useListPatientsQuery,
  useListScheduleBlocksQuery,
} from '@/store/api';
import { DashboardShell } from '@/components/DashboardShell';
import type { RoleViewProps } from '@/components/RoleView';
import { BlockModal } from '@/components/BlockModal';
import { BLOCK_LABEL, BLOCK_CELL_STYLE, blockAtMinute } from '@/lib/schedule';

function toDateStr(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function timeToMin(t: string): number | null {
  const m = t.trim().match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!m) return null;
  let h = Number(m[1]);
  const mm = Number(m[2]);
  if (/pm/i.test(m[3]) && h !== 12) h += 12;
  if (/am/i.test(m[3]) && h === 12) h = 0;
  return h * 60 + mm;
}
const minToLabel = (min: number) => {
  const h = Math.floor(min / 60);
  const mm = min % 60;
  const mer = h >= 12 ? 'PM' : 'AM';
  let hh = h % 12;
  if (hh === 0) hh = 12;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')} ${mer}`;
};

const GRID_MINS: number[] = [];
for (let m = 9 * 60; m <= 17 * 60; m += 30) GRID_MINS.push(m);
const BREAK = new Set([12 * 60, 12 * 60 + 30, 13 * 60]);

// Slots that can be booked (excludes break window)
const BOOKABLE = new Set([
  9 * 60, 9 * 60 + 30, 10 * 60, 10 * 60 + 30, 11 * 60, 11 * 60 + 30,
  13 * 60 + 30, 14 * 60, 14 * 60 + 30, 15 * 60, 15 * 60 + 30, 16 * 60, 16 * 60 + 30,
]);

// Monday of the week containing `d`.
function weekStart(d: Date) {
  const copy = new Date(d);
  const dow = (copy.getDay() + 6) % 7; // Mon=0 … Sun=6
  copy.setDate(copy.getDate() - dow);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

const statusRing: Record<string, string> = {
  scheduled: 'bg-cyan-50 border-cyan-400',
  completed: 'bg-green-50 border-green-400',
};

export function DoctorSchedule({ session }: RoleViewProps) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [blockOpen, setBlockOpen] = useState(false);
  const [error, setError] = useState('');

  const { data: doctor, isLoading: loadingDoctor } = useGetDoctorByUserQuery(session.user.id);
  // Both are already limited to this doctor by the API's "own" scope.
  const { data: appointments = [], isLoading: loadingAppointments } = useListAppointmentsQuery();
  const { data: patients = [], isLoading: loadingPatients } = useListPatientsQuery();
  const { data: blocks = [], isLoading: loadingBlocks } = useListScheduleBlocksQuery();
  const [deleteScheduleBlock] = useDeleteScheduleBlockMutation();

  const model = useMemo(() => {
    const start = weekStart(new Date());
    start.setDate(start.getDate() + weekOffset * 7);

    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return { dateStr: toDateStr(d), dow: d.toLocaleDateString('en-US', { weekday: 'short' }), day: d.getDate(), month: d.toLocaleDateString('en-US', { month: 'short' }), isToday: toDateStr(d) === toDateStr(new Date()) };
    });
    const daySet = new Set(days.map((d) => d.dateStr));

    const patientById = new Map(patients.map((p) => [p.id, p]));
    const patientName = (id: string) => patientById.get(id)?.user?.name ?? 'Patient';

    const appts = appointments.filter(
      (a) => daySet.has(a.date) && a.status !== 'cancelled',
    );

    const mins = new Set(GRID_MINS);
    const cellMap = new Map<string, { id: string; patient: string; reason: string; status: string }>();
    appts.forEach((a) => {
      const min = timeToMin(a.time);
      if (min === null) return;
      mins.add(min);
      cellMap.set(`${a.date}|${min}`, { id: a.id, patient: patientName(a.patientId), reason: a.reason || 'Consultation', status: a.status });
    });

    // The doctor's own schedule blocks for the week, grouped by day.
    const blocksByDay = new Map<string, ScheduleBlock[]>();
    blocks
      .filter((b) => daySet.has(b.date) && (!doctor || b.doctorId === doctor.id))
      .forEach((b) => {
        const list = blocksByDay.get(b.date) ?? [];
        list.push(b);
        blocksByDay.set(b.date, list);
      });

    const label = `${days[0].month} ${days[0].day} – ${days[6].month} ${days[6].day}`;
    return { doctorId: doctor?.id ?? '', days, rowMins: [...mins].sort((x, y) => x - y), cellMap, blocksByDay, count: appts.length, label };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, weekOffset, appointments, patients, blocks, doctor]);

  if (!model) return null;

  return (
    <DashboardShell
      role={session.user.role}
      userName={session.user.name}
      title="Schedule"
      subtitle="Your weekly appointment board"
      loading={loadingDoctor || loadingAppointments || loadingPatients || loadingBlocks}
    >
      <div className="space-y-5">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-teal-800">{model.label}</h2>
            <p className="text-sm text-slate-500">{model.count} appointment(s) this week</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setWeekOffset((w) => w - 1)} className="flex items-center gap-1 px-3 py-2 bg-slate-500 text-white rounded-lg text-sm font-medium hover:bg-slate-600 transition">
              <ChevronLeft className="w-4 h-4" /> Prev
            </button>
            <button onClick={() => setWeekOffset(0)} className="px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-medium hover:bg-slate-50 transition">
              This Week
            </button>
            <button onClick={() => setWeekOffset((w) => w + 1)} className="flex items-center gap-1 px-3 py-2 bg-slate-500 text-white rounded-lg text-sm font-medium hover:bg-slate-600 transition">
              Next <ChevronRight className="w-4 h-4" />
            </button>
            <button onClick={() => setBlockOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-500 to-brand-teal text-white rounded-lg text-sm font-semibold hover:shadow-lg transition">
              <Ban className="w-4 h-4" /> Add Block
            </button>
          </div>
        </div>

        {/* Grid */}
        <div className="bg-white rounded-lg shadow overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-teal-800 text-white font-semibold px-4 py-3 text-left w-24">Time</th>
                {model.days.map((d) => (
                  <th key={d.dateStr} className={`font-semibold px-3 py-3 text-center min-w-[130px] border-l border-teal-500/40 ${d.isToday ? 'bg-gradient-to-r from-cyan-500 to-brand-teal text-white' : 'bg-teal-700 text-white'}`}>
                    <div>{d.dow}</div>
                    <div className="text-xs font-normal text-cyan-100">{d.month} {d.day}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {model.rowMins.map((min) => (
                <tr key={min} className="border-t border-slate-200">
                  <td className="sticky left-0 z-10 bg-slate-50 font-semibold text-slate-700 px-4 py-3 whitespace-nowrap border-r border-slate-200">{minToLabel(min)}</td>
                  {model.days.map((d) => {
                    const cell = model.cellMap.get(`${d.dateStr}|${min}`);
                    const block = blockAtMinute(model.blocksByDay.get(d.dateStr) ?? [], min);
                    const now = new Date();
                    const todayStr = toDateStr(now);
                    const nowMin = now.getHours() * 60 + now.getMinutes();
                    const isPast = d.dateStr < todayStr || (d.dateStr === todayStr && min <= nowMin);
                    return (
                      <td key={d.dateStr} className="border-l border-slate-100 align-top p-0">
                        {cell ? (
                          <Link href={`/appointment/${cell.id}`} className={`block h-full border-l-4 px-3 py-2 hover:brightness-95 transition ${statusRing[cell.status] ?? 'bg-slate-50 border-slate-300'}`}>
                            <p className="font-semibold text-slate-800 truncate">{cell.patient}</p>
                            <p className="text-xs text-slate-500 truncate">{cell.reason}</p>
                          </Link>
                        ) : block ? (
                          <div className={`group relative h-full border-l-4 px-3 py-2 ${BLOCK_CELL_STYLE[block.type]}`}>
                            <p className="font-semibold text-xs">{BLOCK_LABEL[block.type]}</p>
                            {block.note && <p className="text-[11px] opacity-80 truncate">{block.note}</p>}
                            <button
                              onClick={async () => {
                                setError('');
                                try {
                                  await deleteScheduleBlock(block.id).unwrap();
                                } catch (err) {
                                  setError(apiError(err, 'Could not remove the block'));
                                }
                              }}
                              className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-white/60 transition"
                              title="Remove block"
                              aria-label="Remove block"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ) : BREAK.has(min) ? (
                          <div className="px-3 py-3 text-center text-slate-300 text-xs bg-slate-50 cursor-not-allowed">Break</div>
                        ) : BOOKABLE.has(min) && !isPast ? (
                          <Link
                            href={`/dashboard/book?doctor=${model.doctorId}&date=${d.dateStr}&time=${encodeURIComponent(minToLabel(min))}`}
                            className="group block px-3 py-3 text-center text-emerald-600 hover:bg-emerald-50 transition text-xs"
                            title="Book this slot"
                          >
                            <span className="group-hover:hidden">·</span>
                            <span className="hidden group-hover:inline font-medium text-sm">+ Book</span>
                          </Link>
                        ) : (
                          <div className="px-3 py-3 text-center text-slate-200 text-xs cursor-not-allowed">·</div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-600">
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-cyan-50 border-l-4 border-cyan-400" /> Scheduled</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-green-50 border-l-4 border-green-400" /> Completed</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-amber-100 border-l-4 border-amber-400" /> Break</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-purple-100 border-l-4 border-purple-400" /> In OT</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-slate-200 border-l-4 border-slate-400" /> Blocked</span>
          <span className="flex items-center gap-1.5"><CalendarRange className="w-3.5 h-3.5" /> Click a slot to open the visit</span>
        </div>
      </div>

      {blockOpen && (
        <BlockModal
          doctorId={model.doctorId}
          defaultDate={model.days[0].dateStr}
          onClose={() => setBlockOpen(false)}
          onCreated={() => setBlockOpen(false)}
        />
      )}
    </DashboardShell>
  );
}
