'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarPlus, Clock, ArrowRight } from 'lucide-react';
import type { Appointment } from '@/lib/types';
import { useListAppointmentsQuery, useListDoctorsQuery } from '@/store/api';
import { fmtDate } from '@/lib/date';
import { DashboardShell } from '@/components/DashboardShell';
import type { RoleViewProps } from '@/components/RoleView';
import { Calendar } from '@/components/ui/calendar';
import { Spinner } from '@/components/ui/spinner';

function toDateStr(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function slotToMinutes(slot: string) {
  const m = slot.trim().match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!m) return 0;
  let h = Number(m[1]);
  const mm = Number(m[2]);
  if (/pm/i.test(m[3]) && h !== 12) h += 12;
  if (/am/i.test(m[3]) && h === 12) h = 0;
  return h * 60 + mm;
}
const todayStr = toDateStr(new Date());

const statusStyle = (status: Appointment['status']) =>
  status === 'completed'
    ? 'bg-green-100 text-green-700'
    : status === 'cancelled'
    ? 'bg-red-100 text-red-700'
    : 'bg-blue-100 text-blue-700';

export function PatientSchedule({ session }: RoleViewProps) {
  const [selected, setSelected] = useState<Date>(new Date());

  // "own" scope means these are already just this patient's appointments.
  const { data: appts = [], isLoading: loadingAppts } = useListAppointmentsQuery();
  const { data: doctors = [], isLoading: loadingDoctors } = useListDoctorsQuery();

  const doctorName = useMemo(() => {
    const doctorById = new Map(doctors.map((d) => [d.id, d]));
    return (id: string) => {
      const name = doctorById.get(id)?.user?.name;
      return name ? `Dr. ${name}` : 'Doctor';
    };
  }, [doctors]);

  const active = appts.filter((a) => a.status !== 'cancelled');
  // Only highlight days with scheduled (upcoming) appointments — completed past
  // appointments are history, not something the patient needs flagged on the calendar.
  const scheduledDays = useMemo(
    () => appts.filter((a) => a.status === 'scheduled').map((a) => new Date(`${a.date}T00:00:00`)),
    [appts],
  );

  const selectedStr = toDateStr(selected);
  const dayAppts = active
    .filter((a) => a.date === selectedStr)
    .sort((a, b) => slotToMinutes(a.time) - slotToMinutes(b.time));

  const upcoming = active
    .filter((a) => a.status === 'scheduled' && a.date >= todayStr)
    .sort((a, b) => (a.date === b.date ? slotToMinutes(a.time) - slotToMinutes(b.time) : a.date < b.date ? -1 : 1))
    .slice(0, 6);


  return (
    <DashboardShell role={session.user.role} userName={session.user.name} title="Schedule" subtitle="Your appointment calendar" loading={loadingAppts || loadingDoctors}>
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Calendar */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-900">Calendar</h3>
            <Link href="/dashboard/book" className="inline-flex items-center gap-1.5 text-sm font-semibold text-cyan-600 hover:text-cyan-700">
              <CalendarPlus className="w-4 h-4" /> Book
            </Link>
          </div>
          <Calendar
            mode="single"
            selected={selected}
            onSelect={(d) => d && setSelected(d)}
            modifiers={{ booked: scheduledDays }}
            modifiersClassNames={{ booked: 'bg-cyan-100 text-cyan-800 font-bold rounded-md' }}
            className="[--cell-size:2.6rem] rounded-lg border border-slate-200 w-full"
          />
          <div className="flex items-center gap-2 mt-4 text-xs text-slate-500">
            <span className="w-3 h-3 rounded-sm bg-cyan-100 border border-cyan-300" /> Days with appointments
          </div>
        </div>

        {/* Day detail + upcoming */}
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b">
              <h3 className="font-semibold text-slate-900">
                {selected.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </h3>
            </div>
            {dayAppts.length === 0 ? (
              <div className="text-center py-10 text-slate-500 text-sm">No appointments on this day.</div>
            ) : (
              <ul className="divide-y">
                {dayAppts.map((a) => (
                  <li key={a.id} className="flex items-center gap-4 px-6 py-3 hover:bg-slate-50">
                    <div className="w-20 shrink-0 text-sm font-semibold text-slate-700 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-slate-400" /> {a.time}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-900 truncate">{doctorName(a.doctorId)}</p>
                      <p className="text-xs text-slate-500 truncate">{a.reason || 'Consultation'}</p>
                    </div>
                    <span className={`hidden sm:inline-block px-2.5 py-1 rounded-full text-xs font-semibold capitalize ${statusStyle(a.status)}`}>{a.status}</span>
                    <Link href={`/appointment/${a.id}`} className="text-cyan-600 hover:text-cyan-700 text-sm font-semibold shrink-0">Open</Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h3 className="font-semibold text-slate-900">Upcoming</h3>
              <Link href="/dashboard/appointments" className="text-sm text-cyan-600 hover:text-cyan-700 font-semibold flex items-center gap-1">
                All <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            {upcoming.length === 0 ? (
              <div className="text-center py-10 text-slate-500 text-sm">No upcoming appointments.</div>
            ) : (
              <ul className="divide-y">
                {upcoming.map((a) => (
                  <li key={a.id} className="px-6 py-3 hover:bg-slate-50 flex items-center justify-between gap-3">
                    <button onClick={() => setSelected(new Date(`${a.date}T00:00:00`))} className="min-w-0 text-left">
                      <p className="font-medium text-slate-900 truncate">{doctorName(a.doctorId)}</p>
                      <p className="text-xs text-slate-500">{fmtDate(a.date)} at {a.time}</p>
                    </button>
                    <Link href={`/appointment/${a.id}`} className="text-cyan-600 hover:text-cyan-700 text-sm font-semibold shrink-0">View</Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
