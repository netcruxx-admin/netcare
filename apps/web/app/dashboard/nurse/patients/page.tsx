'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Search, UserRound } from 'lucide-react';
import { authStorage } from '@/lib/auth';
import { dbOperations, Appointment, Patient, User } from '@/lib/db';
import { DashboardShell } from '@/components/DashboardShell';
import { ExportButton } from '@/components/ExportButton';

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
  users: User[];
}

export default function NursePatientsPage() {
  const router = useRouter();
  const [session, setSession] = useState<ReturnType<typeof authStorage.getSession>>(null);
  const [raw, setRaw] = useState<RawData | null>(null);
  const [query, setQuery] = useState('');

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
      users: dbOperations.getAllUsers(),
    });
  }, [router]);

  const rows = useMemo(() => {
    if (!raw) return [];
    const userById = new Map(raw.users.map((u) => [u.id, u]));

    const apptsByPatient = new Map<string, Appointment[]>();
    raw.appointments.forEach((a) => {
      const list = apptsByPatient.get(a.patientId) ?? [];
      list.push(a);
      apptsByPatient.set(a.patientId, list);
    });

    const q = query.trim().toLowerCase();
    return raw.patients
      .map((p) => {
        const u = userById.get(p.userId);
        const appts = apptsByPatient.get(p.id) ?? [];
        const next = appts
          .filter((a) => a.status === 'scheduled' && a.date >= todayStr)
          .sort((a, b) => a.date.localeCompare(b.date))[0];
        return {
          patientId: p.id,
          name: u?.name ?? 'Patient',
          phone: p.phone || u?.phone || '—',
          gender: p.gender || '—',
          bloodGroup: p.bloodGroup || '—',
          nextVisit: next?.date ?? null,
        };
      })
      .filter((r) => !q || r.name.toLowerCase().includes(q) || r.phone.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [raw, query]);

  if (!session) return null;

  return (
    <DashboardShell role="nurse" userName={session.user.name} title="Patients" subtitle="All registered patients">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative max-w-md flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search patient or phone…"
              className="w-full pl-9 pr-3 py-2 bg-white rounded-lg shadow text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>
          <ExportButton
            filename="patients"
            headers={['Name', 'Phone', 'Gender', 'Blood Group', 'Next Visit']}
            rows={rows.map((r) => [r.name, r.phone, r.gender, r.bloodGroup, r.nextVisit ?? ''])}
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
                    <th className="text-left py-3 px-6 font-semibold text-slate-900">Patient</th>
                    <th className="text-left py-3 px-6 font-semibold text-slate-900">Gender</th>
                    <th className="text-left py-3 px-6 font-semibold text-slate-900">Blood Group</th>
                    <th className="text-left py-3 px-6 font-semibold text-slate-900">Next Visit</th>
                    <th className="text-right py-3 px-6 font-semibold text-slate-900">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.patientId} className="border-b hover:bg-slate-50">
                      <td className="py-3 px-6">
                        <p className="font-medium text-slate-900">{r.name}</p>
                        <p className="text-xs text-slate-500">{r.phone}</p>
                      </td>
                      <td className="py-3 px-6 text-slate-600">{r.gender}</td>
                      <td className="py-3 px-6 text-slate-600">{r.bloodGroup}</td>
                      <td className="py-3 px-6">
                        {r.nextVisit ? (
                          <span className="inline-block px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">{r.nextVisit}</span>
                        ) : (
                          <span className="text-slate-400 text-sm">—</span>
                        )}
                      </td>
                      <td className="py-3 px-6 text-right">
                        <Link href={`/patient/${r.patientId}`} className="text-cyan-600 hover:text-cyan-700 font-semibold text-sm">
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
