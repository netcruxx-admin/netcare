'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, UserRound } from 'lucide-react';
import { ExportButton } from '@/components/ExportButton';
import { authStorage } from '@/lib/auth';
import { DashboardShell } from '@/components/DashboardShell';
import { useListPatientsQuery, useListAppointmentsQuery } from '@/store/api';

export default function AdminPatientsPage() {
  const router = useRouter();
  const [session, setSession] = useState<ReturnType<typeof authStorage.getSession>>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const s = authStorage.getSession();
    if (!s || s.user.role !== 'admin') { router.push('/login'); return; }
    setSession(s);
  }, [router]);

  const { data: patients = [] } = useListPatientsQuery();
  const { data: appointments = [] } = useListAppointmentsQuery();

  const rows = useMemo(() => {
    const apptCount = new Map<string, number>();
    appointments.forEach((a) => apptCount.set(a.patientId, (apptCount.get(a.patientId) ?? 0) + 1));

    const q = query.trim().toLowerCase();
    return patients
      .map((p) => ({
        id: p.id,
        name: p.user?.name ?? '—',
        email: p.user?.email ?? '—',
        gender: p.gender || '—',
        bloodGroup: p.bloodGroup || '—',
        phone: p.phone || p.user?.phone || '—',
        appointments: apptCount.get(p.id) ?? 0,
      }))
      .filter((r) =>
        !q ||
        r.name.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q) ||
        r.phone.toLowerCase().includes(q)
      )
      .sort((a, b) => b.appointments - a.appointments);
  }, [patients, appointments, query]);

  if (!session) return null;

  return (
    <DashboardShell role="admin" userName={session.user.name} title="Patients" subtitle="Registered patients">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, email or phone…"
              className="w-full pl-9 pr-3 py-2 bg-white rounded-lg shadow text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>
          <ExportButton
            filename="patients"
            headers={['Name', 'Email', 'Gender', 'Blood Group', 'Phone', 'Appointments']}
            rows={rows.map((r) => [r.name, r.email, r.gender, r.bloodGroup, r.phone, r.appointments])}
          />
        </div>

        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b">
            <h3 className="font-semibold text-slate-900">Patients ({rows.length})</h3>
          </div>
          {rows.length === 0 ? (
            <div className="text-center py-16">
              <UserRound className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-600">No patients found.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-slate-50">
                    <th className="text-left py-3 px-6 font-semibold text-slate-900">Name</th>
                    <th className="text-left py-3 px-6 font-semibold text-slate-900">Email</th>
                    <th className="text-left py-3 px-6 font-semibold text-slate-900">Gender</th>
                    <th className="text-left py-3 px-6 font-semibold text-slate-900">Blood Group</th>
                    <th className="text-left py-3 px-6 font-semibold text-slate-900">Phone</th>
                    <th className="text-left py-3 px-6 font-semibold text-slate-900">Appointments</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b hover:bg-slate-50">
                      <td className="py-3 px-6 font-medium text-slate-900">{r.name}</td>
                      <td className="py-3 px-6 text-slate-600 text-sm">{r.email}</td>
                      <td className="py-3 px-6 text-slate-600">{r.gender}</td>
                      <td className="py-3 px-6 text-slate-600">{r.bloodGroup}</td>
                      <td className="py-3 px-6 text-slate-600">{r.phone}</td>
                      <td className="py-3 px-6 font-semibold text-slate-900">{r.appointments}</td>
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
