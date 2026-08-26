'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import {
  CalendarClock,
  CalendarCheck,
  CheckCircle2,
  Users,
  Clock,
  ArrowRight,
  Stethoscope,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Appointment, Doctor, Patient, User } from '@/lib/types';
import {
  useGetDoctorByUserQuery,
  useListAppointmentsQuery,
  useListPatientsQuery,
} from '@/store/api';
import { DashboardShell } from '@/components/DashboardShell';
import type { RoleViewProps } from '@/components/RoleView';
import { fmtDate } from '@/lib/date';

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

export function DoctorDashboard({ session }: RoleViewProps) {
  // The doctor record supplies the specialization; appointments and patients
  // arrive already narrowed to this doctor by the API's "own" scope.
  const { data: doctor } = useGetDoctorByUserQuery(session.user.id);
  const { data: appts = [], isLoading } = useListAppointmentsQuery();
  const { data: patients = [] } = useListPatientsQuery();

  const model = useMemo(() => {
    const patientById = new Map(patients.map((p) => [p.id, p]));
    const patientOf = (id: string) => {
      const p = patientById.get(id);
      return { name: p?.user?.name ?? 'Patient', phone: p?.phone || '' };
    };
    const decorate = (a: Appointment) => ({ ...a, ...patientOf(a.patientId) });

    const today = appts
      .filter((a) => a.date === todayStr && a.status !== 'cancelled')
      .sort((a, b) => slotToMinutes(a.time) - slotToMinutes(b.time))
      .map(decorate);

    const upcoming = appts
      .filter((a) => a.status === 'scheduled' && a.date >= todayStr)
      .sort((a, b) => (a.date === b.date ? slotToMinutes(a.time) - slotToMinutes(b.time) : a.date < b.date ? -1 : 1))
      .map(decorate);

    const recent = appts
      .filter((a) => a.status === 'completed')
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, 5)
      .map(decorate);

    const kpis = {
      today: today.length,
      upcoming: upcoming.length,
      completed: appts.filter((a) => a.status === 'completed').length,
      patients: new Set(appts.map((a) => a.patientId)).size,
    };

    return { today, upcoming, recent, kpis, specialization: doctor?.specialization ?? '' };
  }, [appts, patients, doctor]);


  const cards: { label: string; value: number; icon: LucideIcon; tint: string }[] = [
    { label: "Today's Appointments", value: model.kpis.today, icon: CalendarClock, tint: 'text-cyan-600 bg-cyan-50' },
    { label: 'Upcoming', value: model.kpis.upcoming, icon: CalendarCheck, tint: 'text-blue-600 bg-blue-50' },
    { label: 'Completed', value: model.kpis.completed, icon: CheckCircle2, tint: 'text-green-600 bg-green-50' },
    { label: 'My Patients', value: model.kpis.patients, icon: Users, tint: 'text-purple-600 bg-purple-50' },
  ];

  return (
    <DashboardShell role={session.user.role} userName={session.user.name} title="Dashboard" subtitle="Your day at a glance" loading={isLoading}>
      <div className="space-y-6">
        {/* Welcome banner */}
        <div className="bg-gradient-to-r from-cyan-500 to-brand-teal text-white rounded-lg p-6 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold">Welcome back, Dr. {session.user.name}</h2>
            <p className="text-cyan-100 flex items-center gap-2 mt-1">
              <Stethoscope className="w-4 h-4" /> {model.specialization || 'Doctor'}
            </p>
          </div>
          <Link
            href="/dashboard/appointments"
            className="hidden sm:inline-flex items-center gap-2 bg-white/15 hover:bg-white/25 px-4 py-2 rounded-lg font-semibold transition"
          >
            View all appointments <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* KPI tiles */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {cards.map((c) => {
            const Icon = c.icon;
            return (
              <div key={c.label} className="bg-white rounded-lg shadow p-4 flex items-center gap-3">
                <div className={`w-11 h-11 rounded-lg flex items-center justify-center shrink-0 ${c.tint}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-2xl font-bold text-slate-900 leading-tight">{c.value}</p>
                  <p className="text-xs text-slate-500">{c.label}</p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Today's schedule */}
          <div className="lg:col-span-2 bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                <CalendarClock className="w-5 h-5 text-cyan-600" /> Today's Schedule
              </h3>
              <span className="text-sm text-slate-500">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</span>
            </div>
            {model.today.length === 0 ? (
              <div className="text-center py-14">
                <CalendarClock className="w-14 h-14 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-600">No appointments scheduled today.</p>
              </div>
            ) : (
              <ul className="divide-y">
                {model.today.map((a) => (
                  <li key={a.id} className="flex items-center gap-4 px-6 py-3 hover:bg-slate-50">
                    <div className="w-20 shrink-0 text-sm font-semibold text-slate-700 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-slate-400" /> {a.time}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-900 truncate">{a.name}</p>
                      <p className="text-xs text-slate-500 truncate">{a.reason || 'Consultation'}</p>
                    </div>
                    <span className={`hidden sm:inline-block px-2.5 py-1 rounded-full text-xs font-semibold capitalize ${statusStyle(a.status)}`}>
                      {a.status}
                    </span>
                    <Link href={`/appointment/${a.id}`} className="text-cyan-600 hover:text-cyan-700 text-sm font-semibold shrink-0">
                      Open
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Recent completed */}
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b">
              <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-600" /> Recent Visits
              </h3>
            </div>
            {model.recent.length === 0 ? (
              <div className="text-center py-14">
                <CheckCircle2 className="w-14 h-14 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-600 text-sm">No completed visits yet.</p>
              </div>
            ) : (
              <ul className="divide-y">
                {model.recent.map((a) => (
                  <li key={a.id} className="px-6 py-3 hover:bg-slate-50">
                    <Link href={`/appointment/${a.id}`} className="block">
                      <p className="font-medium text-slate-900 truncate">{a.name}</p>
                      <p className="text-xs text-slate-500">{fmtDate(a.date)} · {a.reason || 'Consultation'}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Upcoming preview */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b flex items-center justify-between">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2">
              <CalendarCheck className="w-5 h-5 text-blue-600" /> Upcoming Appointments
            </h3>
            <Link href="/dashboard/appointments" className="text-cyan-600 hover:text-cyan-700 text-sm font-semibold">
              See all
            </Link>
          </div>
          {model.upcoming.length === 0 ? (
            <div className="text-center py-14">
              <CalendarCheck className="w-14 h-14 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-600">No upcoming appointments.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-slate-50">
                    <th className="text-left py-3 px-6 font-semibold text-slate-900">Patient</th>
                    <th className="text-left py-3 px-6 font-semibold text-slate-900">Date &amp; Time</th>
                    <th className="text-left py-3 px-6 font-semibold text-slate-900">Reason</th>
                    <th className="text-right py-3 px-6 font-semibold text-slate-900">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {model.upcoming.slice(0, 6).map((a) => (
                    <tr key={a.id} className="border-b hover:bg-slate-50">
                      <td className="py-3 px-6">
                        <p className="font-medium text-slate-900">{a.name}</p>
                        <p className="text-xs text-slate-500">{a.phone || '—'}</p>
                      </td>
                      <td className="py-3 px-6 text-slate-600 whitespace-nowrap">{fmtDate(a.date)} at {a.time}</td>
                      <td className="py-3 px-6 text-slate-600">{a.reason || 'Consultation'}</td>
                      <td className="py-3 px-6 text-right">
                        <Link href={`/appointment/${a.id}`} className="text-cyan-600 hover:text-cyan-700 font-semibold text-sm">
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
