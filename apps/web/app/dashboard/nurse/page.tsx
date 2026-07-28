'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { CalendarDays, Users, HeartPulse, ClipboardCheck, ArrowRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { authStorage } from '@/lib/auth';
import { dbOperations, Appointment, Doctor, Patient, User, Vitals } from '@/lib/db';
import { DashboardShell } from '@/components/DashboardShell';

function toDateStr(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
const todayStr = toDateStr(new Date());

interface RawData {
  appointments: Appointment[];
  patients: Patient[];
  doctors: Doctor[];
  users: User[];
  vitals: Vitals[];
}

export default function NurseDashboard() {
  const router = useRouter();
  const [session, setSession] = useState<ReturnType<typeof authStorage.getSession>>(null);
  const [raw, setRaw] = useState<RawData | null>(null);

  useEffect(() => {
    const s = authStorage.getSession();
    if (!s || s.user.role !== 'nurse') {
      router.push('/login');
      return;
    }
    setSession(s);
    setRaw({
      appointments: dbOperations.getAllAppointments(),
      patients: dbOperations.getAllPatients(),
      doctors: dbOperations.getAllDoctors(),
      users: dbOperations.getAllUsers(),
      vitals: dbOperations.getAllVitals(),
    });
  }, [router]);

  const model = useMemo(() => {
    if (!raw) return null;
    const userById = new Map(raw.users.map((u) => [u.id, u]));
    const patientById = new Map(raw.patients.map((p) => [p.id, p]));
    const doctorById = new Map(raw.doctors.map((d) => [d.id, d]));

    const patientName = (id: string) => {
      const p = patientById.get(id);
      return (p ? userById.get(p.userId)?.name : null) ?? 'Patient';
    };
    const doctorName = (id: string) => {
      const d = doctorById.get(id);
      const name = d ? userById.get(d.userId)?.name : null;
      return name ? `Dr. ${name}` : '—';
    };

    const withVitals = new Set(raw.vitals.map((v) => v.appointmentId));

    const todaysAppts = raw.appointments
      .filter((a) => a.date === todayStr && a.status !== 'cancelled')
      .map((a) => ({
        ...a,
        patient: patientName(a.patientId),
        doctor: doctorName(a.doctorId),
        hasVitals: withVitals.has(a.id),
      }))
      .sort((a, b) => a.time.localeCompare(b.time));

    const kpis = {
      todaysAppts: todaysAppts.length,
      patients: raw.patients.length,
      vitalsToday: raw.vitals.filter((v) => v.createdAt.slice(0, 10) === todayStr).length,
      pendingVitals: todaysAppts.filter((a) => a.status === 'scheduled' && !a.hasVitals).length,
    };

    return { kpis, todaysAppts };
  }, [raw]);

  if (!session || !model) return null;

  const cards: { label: string; value: number; icon: LucideIcon; tint: string }[] = [
    { label: "Today's Appointments", value: model.kpis.todaysAppts, icon: CalendarDays, tint: 'text-cyan-600 bg-cyan-50' },
    { label: 'Total Patients', value: model.kpis.patients, icon: Users, tint: 'text-indigo-600 bg-indigo-50' },
    { label: 'Vitals Recorded Today', value: model.kpis.vitalsToday, icon: HeartPulse, tint: 'text-green-600 bg-green-50' },
    { label: 'Awaiting Vitals', value: model.kpis.pendingVitals, icon: ClipboardCheck, tint: 'text-amber-600 bg-amber-50' },
  ];

  return (
    <DashboardShell role="nurse" userName={session.user.name} title="Nursing Station" subtitle="Daily overview">
      <div className="space-y-6">
        <div className="bg-gradient-to-r from-cyan-500 to-teal-600 text-white rounded-lg p-6 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold">Welcome, {session.user.name}</h2>
            <p className="text-cyan-100 mt-1">
              {model.kpis.pendingVitals > 0
                ? `${model.kpis.pendingVitals} patient(s) still awaiting vitals today.`
                : 'All scheduled patients have vitals recorded today.'}
            </p>
          </div>
          <Link
            href="/dashboard/nurse/vitals"
            className="hidden sm:inline-flex items-center gap-2 bg-white/15 hover:bg-white/25 px-4 py-2 rounded-lg font-semibold transition"
          >
            Record vitals <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

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

        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">Today&apos;s Appointments ({model.todaysAppts.length})</h3>
            <Link href="/dashboard/nurse/appointments" className="text-cyan-600 hover:text-cyan-700 text-sm font-semibold">
              See all
            </Link>
          </div>
          {model.todaysAppts.length === 0 ? (
            <div className="text-center py-14">
              <CalendarDays className="w-14 h-14 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-600">No appointments scheduled for today.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-slate-50">
                    <th className="text-left py-3 px-6 font-semibold text-slate-900">Time</th>
                    <th className="text-left py-3 px-6 font-semibold text-slate-900">Patient</th>
                    <th className="text-left py-3 px-6 font-semibold text-slate-900">Doctor</th>
                    <th className="text-left py-3 px-6 font-semibold text-slate-900">Vitals</th>
                    <th className="text-right py-3 px-6 font-semibold text-slate-900">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {model.todaysAppts.slice(0, 8).map((a) => (
                    <tr key={a.id} className="border-b hover:bg-slate-50">
                      <td className="py-3 px-6 font-medium text-slate-900">{a.time}</td>
                      <td className="py-3 px-6 text-slate-700">{a.patient}</td>
                      <td className="py-3 px-6 text-slate-600">{a.doctor}</td>
                      <td className="py-3 px-6">
                        {a.hasVitals ? (
                          <span className="inline-block px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">Recorded</span>
                        ) : (
                          <span className="inline-block px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">Pending</span>
                        )}
                      </td>
                      <td className="py-3 px-6 text-right">
                        <Link href={`/dashboard/nurse/vitals?appt=${a.id}`} className="text-cyan-600 hover:text-cyan-700 font-semibold text-sm">
                          {a.hasVitals ? 'Update' : 'Record'}
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
