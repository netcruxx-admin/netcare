'use client';

import Link from 'next/link';
import { CheckCircle } from 'lucide-react';
import { useListAppointmentsQuery, useListPatientsQuery } from '@/store/api';
import { DashboardShell } from '@/components/DashboardShell';
import type { RoleViewProps } from '@/components/RoleView';

export function DoctorCompleted({ session }: RoleViewProps) {
  // Scope "own" means the API already limits these to this doctor's own work.
  const { data: appointments = [] } = useListAppointmentsQuery();
  const { data: patients = [] } = useListPatientsQuery();

  const patientName = (patientId: string) =>
    patients.find((p) => p.id === patientId)?.user?.name ?? 'Patient';

  const completed = appointments
    .filter((a) => a.status === 'completed')
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <DashboardShell
      role={session.user.role}
      userName={session.user.name}
      title="Completed Visits"
      subtitle="Appointments you have completed"
    >
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b">
          <h3 className="font-semibold text-slate-900">Completed ({completed.length})</h3>
        </div>

        {completed.length === 0 ? (
          <div className="text-center py-16">
            <CheckCircle className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-600">No completed visits yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-slate-50">
                  <th className="text-left py-3 px-6 font-semibold text-slate-900">Date &amp; Time</th>
                  <th className="text-left py-3 px-6 font-semibold text-slate-900">Patient</th>
                  <th className="text-left py-3 px-6 font-semibold text-slate-900">Reason</th>
                  <th className="text-right py-3 px-6 font-semibold text-slate-900">Actions</th>
                </tr>
              </thead>
              <tbody>
                {completed.map((apt) => (
                  <tr key={apt.id} className="border-b hover:bg-slate-50">
                    <td className="py-3 px-6 font-medium">{apt.date} at {apt.time}</td>
                    <td className="py-3 px-6 text-slate-600">{patientName(apt.patientId)}</td>
                    <td className="py-3 px-6 text-slate-600">{apt.reason || 'Checkup'}</td>
                    <td className="py-3 px-6 text-right">
                      <Link
                        href={`/appointment/${apt.id}`}
                        className="text-cyan-600 hover:text-cyan-700 font-semibold text-sm"
                      >
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
    </DashboardShell>
  );
}
