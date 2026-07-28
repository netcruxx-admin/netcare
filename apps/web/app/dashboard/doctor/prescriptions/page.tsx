'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Search, Pill } from 'lucide-react';
import { authStorage } from '@/lib/auth';
import { dbOperations, Prescription, Patient, User } from '@/lib/db';
import { DashboardShell } from '@/components/DashboardShell';
import { ExportButton } from '@/components/ExportButton';

interface RawData {
  prescriptions: Prescription[];
  patients: Patient[];
  users: User[];
}

export default function DoctorPrescriptionsPage() {
  const router = useRouter();
  const [session, setSession] = useState<ReturnType<typeof authStorage.getSession>>(null);
  const [raw, setRaw] = useState<RawData | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const s = authStorage.getSession();
    if (!s || s.user.role !== 'doctor') {
      router.push('/login');
      return;
    }
    setSession(s);
    const doctor = dbOperations.getAllDoctors().find((d) => d.userId === s.user.id) ?? null;
    setRaw({
      prescriptions: doctor ? dbOperations.getPrescriptionsByDoctorId(doctor.id) : [],
      patients: dbOperations.getAllPatients(),
      users: dbOperations.getAllUsers(),
    });
  }, [router]);

  const rows = useMemo(() => {
    if (!raw) return [];
    const userById = new Map(raw.users.map((u) => [u.id, u]));
    const patientById = new Map(raw.patients.map((p) => [p.id, p]));
    const patientName = (id: string) => {
      const p = patientById.get(id);
      const u = p ? userById.get(p.userId) : null;
      return u?.name ?? 'Patient';
    };

    const q = query.trim().toLowerCase();
    return raw.prescriptions
      .map((rx) => ({ ...rx, patient: patientName(rx.patientId), date: rx.createdAt.split('T')[0] }))
      .filter((r) => !q || r.patient.toLowerCase().includes(q) || r.medicineName.toLowerCase().includes(q))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [raw, query]);

  if (!session) return null;

  return (
    <DashboardShell role="doctor" userName={session.user.name} title="Prescriptions" subtitle="Medicines you have prescribed">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search patient or medicine…"
              className="w-full pl-9 pr-3 py-2 bg-white rounded-lg shadow text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>
          <ExportButton
            filename="prescriptions"
            headers={['Date', 'Patient', 'Medicine', 'Dosage', 'Frequency', 'Duration', 'Instructions']}
            rows={rows.map((r) => [r.date, r.patient, r.medicineName, r.dosage, r.frequency, r.duration, r.instructions])}
          />
        </div>

        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b">
            <h3 className="font-semibold text-slate-900">Prescriptions ({rows.length})</h3>
          </div>
          {rows.length === 0 ? (
            <div className="text-center py-16">
              <Pill className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-600">No prescriptions yet. Add one from an appointment.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-slate-50">
                    <th className="text-left py-3 px-6 font-semibold text-slate-900">Date</th>
                    <th className="text-left py-3 px-6 font-semibold text-slate-900">Patient</th>
                    <th className="text-left py-3 px-6 font-semibold text-slate-900">Medicine</th>
                    <th className="text-left py-3 px-6 font-semibold text-slate-900">Dosage</th>
                    <th className="text-left py-3 px-6 font-semibold text-slate-900">Frequency</th>
                    <th className="text-left py-3 px-6 font-semibold text-slate-900">Duration</th>
                    <th className="text-right py-3 px-6 font-semibold text-slate-900">Visit</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b hover:bg-slate-50">
                      <td className="py-3 px-6 text-slate-600 whitespace-nowrap">{r.date}</td>
                      <td className="py-3 px-6 font-medium text-slate-900">{r.patient}</td>
                      <td className="py-3 px-6">
                        <span className="inline-flex items-center gap-1.5 text-slate-900 font-medium">
                          <Pill className="w-4 h-4 text-cyan-600" /> {r.medicineName}
                        </span>
                        {r.instructions && <p className="text-xs text-slate-500 mt-0.5">{r.instructions}</p>}
                      </td>
                      <td className="py-3 px-6 text-slate-600">{r.dosage}</td>
                      <td className="py-3 px-6 text-slate-600">{r.frequency}</td>
                      <td className="py-3 px-6 text-slate-600">{r.duration}</td>
                      <td className="py-3 px-6 text-right">
                        <Link href={`/appointment/${r.appointmentId}`} className="text-cyan-600 hover:text-cyan-700 font-semibold text-sm">
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
