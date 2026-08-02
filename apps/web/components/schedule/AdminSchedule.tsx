'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, RefreshCw, Ban, X } from 'lucide-react';
import type { ScheduleBlock } from '@/lib/types';
import { apiError } from '@/lib/apiError';
import {
  useDeleteScheduleBlockMutation,
  useListAppointmentsQuery,
  useListDoctorsQuery,
  useListPatientsQuery,
  useListScheduleBlocksQuery,
} from '@/store/api';
import { DashboardShell } from '@/components/DashboardShell';
import type { RoleViewProps } from '@/components/RoleView';
import { BlockModal } from '@/components/BlockModal';
import { BLOCK_LABEL, BLOCK_CELL_STYLE, blockAtMinute } from '@/lib/schedule';

const toDateStr = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const prettyDate = (str: string) =>
  new Date(`${str}T00:00:00`).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

// Parse "9:00 AM" / "02:30 PM" -> minutes since midnight (tolerant of leading zeros)
function timeToMin(t: string): number | null {
  const m = t.trim().match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!m) return null;
  let h = Number(m[1]);
  const mm = Number(m[2]);
  const mer = m[3].toUpperCase();
  if (mer === 'PM' && h !== 12) h += 12;
  if (mer === 'AM' && h === 12) h = 0;
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

// Base 30-min grid, 9:00 AM – 5:00 PM
const GRID_MINS: number[] = [];
for (let m = 9 * 60; m <= 17 * 60; m += 30) GRID_MINS.push(m);

// Slots that can be booked from here (matches the booking form; excludes the lunch break)
const BOOKABLE = new Set([
  '09:00 AM', '09:30 AM', '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM',
  '02:00 PM', '02:30 PM', '03:00 PM', '03:30 PM', '04:00 PM', '04:30 PM',
]);

// Clinic lunch break window
const BREAK = new Set(['12:00 PM', '12:30 PM', '01:00 PM', '01:30 PM']);

export function AdminSchedule({ session }: RoleViewProps) {
  const [date, setDate] = useState(toDateStr(new Date()));
  const [blockOpen, setBlockOpen] = useState(false);
  const [error, setError] = useState('');

  const { data: allDoctors = [] } = useListDoctorsQuery();
  const { data: allPatients = [] } = useListPatientsQuery();
  const { data: allAppointments = [], refetch: refetchAppointments } = useListAppointmentsQuery();
  const { data: allBlocks = [], refetch: refetchBlocks } = useListScheduleBlocksQuery();
  const [deleteScheduleBlock] = useDeleteScheduleBlockMutation();

  const { doctors, rowMins, cellMap, blocksByDoctor } = useMemo(() => {
    const patientById = new Map(allPatients.map((p) => [p.id, p]));

    const doctors = allDoctors.map((d) => ({
      id: d.id,
      name: d.user?.name ? `Dr. ${d.user.name}` : 'Doctor',
      specialization: d.specialization,
    }));

    const dayAppts = allAppointments.filter(
      (a) => a.date === date && a.status !== 'cancelled',
    );

    // Rows = base grid ∪ any appointment times that fall off-grid
    const mins = new Set(GRID_MINS);
    const cellMap = new Map<string, { patient: string; reason: string }>();
    dayAppts.forEach((a) => {
      const min = timeToMin(a.time);
      if (min === null) return;
      mins.add(min);
      const patient = patientById.get(a.patientId)?.user?.name ?? 'Patient';
      cellMap.set(`${a.doctorId}|${min}`, { patient, reason: a.reason || 'Consultation' });
    });

    // Schedule blocks (break / OT / unavailable) for the day, grouped by doctor.
    const dayBlocks = allBlocks.filter((b) => b.date === date);
    const blocksByDoctor = new Map<string, ScheduleBlock[]>();
    dayBlocks.forEach((b) => {
      const list = blocksByDoctor.get(b.doctorId) ?? [];
      list.push(b);
      blocksByDoctor.set(b.doctorId, list);
    });

    return { doctors, rowMins: [...mins].sort((x, y) => x - y), cellMap, blocksByDoctor };
  }, [date, allDoctors, allPatients, allAppointments, allBlocks]);


  const shiftDay = (delta: number) =>
    setDate(toDateStr(new Date(new Date(`${date}T00:00:00`).getTime() + delta * 86400000)));

  const doctorOptions = doctors.map((d) => ({ value: d.id, label: `${d.name} — ${d.specialization}` }));
  const removeBlock = async (id: string) => {
    setError('');
    try {
      await deleteScheduleBlock(id).unwrap();
    } catch (err) {
      setError(apiError(err, 'Could not remove the block'));
    }
  };

  return (
    <DashboardShell
      role={session.user.role}
      userName={session.user.name}
      title="Schedule"
      subtitle="Daily appointment board by doctor"
    >
      <div className="space-y-5">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-bold text-teal-800">Appointments for {prettyDate(date)}</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => shiftDay(-1)}
              className="flex items-center gap-1 px-3 py-2 bg-slate-500 text-white rounded-lg text-sm font-medium hover:bg-slate-600 transition"
            >
              <ChevronLeft className="w-4 h-4" /> Previous
            </button>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
            <button
              onClick={() => shiftDay(1)}
              className="flex items-center gap-1 px-3 py-2 bg-slate-500 text-white rounded-lg text-sm font-medium hover:bg-slate-600 transition"
            >
              Next <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => setBlockOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-50 transition"
            >
              <Ban className="w-4 h-4" /> Add Block
            </button>
            <button
              onClick={() => {
                refetchAppointments();
                refetchBlocks();
              }}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-500 to-brand-teal text-white rounded-lg text-sm font-semibold hover:shadow-lg transition"
            >
              <RefreshCw className="w-4 h-4" /> Refresh
            </button>
          </div>
        </div>

        {/* Grid */}
        <div className="bg-white rounded-lg shadow overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-teal-800 text-white font-semibold px-4 py-3 text-left w-28">
                  Time
                </th>
                {doctors.map((d) => (
                  <th
                    key={d.id}
                    className="bg-gradient-to-r from-cyan-500 to-brand-teal text-white font-semibold px-4 py-3 text-center min-w-[180px] border-l border-teal-500/40"
                  >
                    <div>{d.name}</div>
                    <div className="text-xs font-normal text-cyan-100">{d.specialization}</div>
                  </th>
                ))}
                {doctors.length === 0 && (
                  <th className="bg-teal-700 text-white px-4 py-3">No doctors</th>
                )}
              </tr>
            </thead>
            <tbody>
              {rowMins.map((min) => (
                <tr key={min} className="border-t border-slate-200">
                  <td className="sticky left-0 z-10 bg-slate-50 font-semibold text-slate-700 px-4 py-3 whitespace-nowrap border-r border-slate-200">
                    {minToLabel(min)}
                  </td>
                  {doctors.map((d) => {
                    const cell = cellMap.get(`${d.id}|${min}`);
                    const label = minToLabel(min);
                    const block = blockAtMinute(blocksByDoctor.get(d.id) ?? [], min);
                    return (
                      <td key={d.id} className="border-l border-slate-100 align-top p-0">
                        {cell ? (
                          <div className="h-full bg-rose-50 border-l-4 border-rose-400 px-4 py-3">
                            <p className="font-semibold text-slate-800">{cell.patient}</p>
                            <p className="text-xs text-slate-500">{cell.reason}</p>
                          </div>
                        ) : block ? (
                          <div className={`group relative h-full border-l-4 px-4 py-3 ${BLOCK_CELL_STYLE[block.type]}`}>
                            <p className="font-semibold text-sm">{BLOCK_LABEL[block.type]}</p>
                            {block.note && <p className="text-xs opacity-80">{block.note}</p>}
                            <button
                              onClick={() => removeBlock(block.id)}
                              className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-white/60 transition"
                              title="Remove block"
                              aria-label="Remove block"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : BOOKABLE.has(label) ? (
                          <Link
                            href={`/dashboard/book?doctor=${d.id}&date=${date}&time=${encodeURIComponent(label)}`}
                            className="group block px-4 py-3 text-center text-emerald-600 hover:bg-emerald-50 transition"
                            title="Book this slot"
                          >
                            <span className="group-hover:hidden">Available</span>
                            <span className="hidden group-hover:inline font-medium">+ Book</span>
                          </Link>
                        ) : BREAK.has(label) ? (
                          <div className="px-4 py-3 text-center text-slate-400 text-sm bg-slate-50">Break</div>
                        ) : (
                          <div className="px-4 py-3 text-center text-slate-300 text-sm bg-slate-50">—</div>
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
        <div className="flex items-center gap-6 text-xs text-slate-600">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-rose-100 border-l-4 border-rose-400" /> Booked
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm border border-emerald-300" /> Available
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-amber-100 border-l-4 border-amber-400" /> Break
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-purple-100 border-l-4 border-purple-400" /> In OT
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-slate-200 border-l-4 border-slate-400" /> Blocked
          </span>
        </div>
      </div>

      {blockOpen && (
        <BlockModal
          doctorOptions={doctorOptions}
          defaultDate={date}
          onClose={() => setBlockOpen(false)}
          onCreated={() => { setBlockOpen(false); }}
        />
      )}
    </DashboardShell>
  );
}
