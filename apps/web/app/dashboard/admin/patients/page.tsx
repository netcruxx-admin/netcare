'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Search, UserRound } from 'lucide-react';
import { ExportButton } from '@/components/ExportButton';
import { authStorage } from '@/lib/auth';
import { dbOperations, Appointment, Patient, User } from '@/lib/db';
import { DashboardShell } from '@/components/DashboardShell';

interface RawData {
  patients: Patient[];
  users: User[];
  appointments: Appointment[];
}

export default function AdminPatientsPage() {
  const router = useRouter();
  const [session, setSession] = useState<ReturnType<typeof authStorage.getSession>>(null);
  const [raw, setRaw] = useState<RawData | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const session = authStorage.getSession();
    if (!session || session.user.role !== 'admin') {
      router.push('/login');
      return;
    }
    setSession(session);
    setRaw({
      patients: dbOperations.getAllPatients(),
      users: dbOperations.getAllUsers(),
      appointments: dbOperations.getAllAppointments(),
    });
  }, [router]);

  const rows = useMemo(() => {
    if (!raw) return [];
    const userById = new Map(raw.users.map((u) => [u.id, u]));
    const apptCount = new Map<string, number>();
    raw.appointments.forEach((a) => apptCount.set(a.patientId, (apptCount.get(a.patientId) ?? 0) + 1));

    const q = query.trim().toLowerCase();
    return raw.patients
      .map((p) => {
        const user = userById.get(p.userId);
        return {
          id: p.id,
          name: user?.name ?? '—',
          email: user?.email ?? '—',
          gender: p.gender || '—',
          bloodGroup: p.bloodGroup || '—',
          phone: p.emergencyPhone || '—',
          appointments: apptCount.get(p.id) ?? 0,
        };
      })
      .filter((r) => !q || r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [raw, query]);

  if (!session) {
    return null;
  }

  return (
    <DashboardShell
      role="admin"
      userName={session.user.name}
      title="Patients"
      subtitle="Registered patients"
    >
      <div className="space-y-6">
        {/* Search + export */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search patient name or email…"
              className="w-full pl-9 pr-3 py-2 bg-white rounded-lg shadow text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>
          <ExportButton
            filename="patients"
            headers={['Name', 'Email', 'Gender', 'Blood Group', 'Appointments']}
            rows={rows.map((r) => [r.name, r.email, r.gender, r.bloodGroup, r.appointments])}
          />
        </div>

        {/* Table */}
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
                    <th className="text-left py-3 px-6 font-semibold text-slate-900">Appointments</th>
                    <th className="text-right py-3 px-6 font-semibold text-slate-900">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b hover:bg-slate-50">
                      <td className="py-3 px-6 font-medium">{r.name}</td>
                      <td className="py-3 px-6 text-slate-600">{r.email}</td>
                      <td className="py-3 px-6 text-slate-600">{r.gender}</td>
                      <td className="py-3 px-6 text-slate-600">{r.bloodGroup}</td>
                      <td className="py-3 px-6 font-semibold text-slate-900">{r.appointments}</td>
                      <td className="py-3 px-6 text-right">
                        <Link href={`/patient/${r.id}`} className="text-cyan-600 hover:text-cyan-700 font-semibold text-sm">
                          View Details
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
