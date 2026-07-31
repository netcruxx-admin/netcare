'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { UserRound, Plus } from 'lucide-react';
import { DashboardShell } from '@/components/DashboardShell';
import type { RoleViewProps } from '@/components/RoleView';
import { AddPatientModal } from '@/components/superadmin/AddPatientModal';
import { HospitalBadge } from '@/components/superadmin/HospitalBadge';
import { useGetSuperadminPatientsQuery, useGetSuperadminAppointmentsQuery, useListHospitalsQuery } from '@/store/api';

/** The platform owner's cross-tenant patient list — a different screen from the
 *  per-hospital directory, so it stays its own view behind the same route. */
export function PlatformPatients({ session }: RoleViewProps) {
  const searchParams = useSearchParams();
  const selectedHospitalId = searchParams.get('h') ?? '';

  const [modalOpen, setModalOpen] = useState(false);

  const { data: allPatients = [], isLoading, refetch } = useGetSuperadminPatientsQuery();
  const { data: allAppointments = [] } = useGetSuperadminAppointmentsQuery();
  const { data: hospitals = [] } = useListHospitalsQuery();

  const patients = selectedHospitalId
    ? allPatients.filter((p) => p.hospitalId === selectedHospitalId)
    : allPatients;

  const apptCount = new Map<string, number>();
  allAppointments.forEach((a) => apptCount.set(a.patientId, (apptCount.get(a.patientId) ?? 0) + 1));

  const showHospital = !selectedHospitalId;

  return (
    <DashboardShell
      role={session.user.role}
      userName={session.user.name}
      title="All Patients"
      subtitle={selectedHospitalId ? 'Filtered by selected hospital' : 'Across every hospital on the platform'}
    >
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <p className="text-sm text-slate-500">
            {patients.length} patient{patients.length !== 1 ? 's' : ''}
            {selectedHospitalId && <span className="text-slate-400"> (filtered)</span>}
          </p>
          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-700 transition"
          >
            <Plus className="w-4 h-4" /> Add Patient
          </button>
        </div>
        {isLoading ? (
          <div className="py-16 text-center text-slate-400 text-sm">Loading…</div>
        ) : patients.length === 0 ? (
          <div className="py-16 text-center">
            <UserRound className="w-16 h-16 text-slate-200 mx-auto mb-4" />
            <p className="text-slate-500">No patients found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {showHospital && <th className="text-left py-3 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wide">Hospital</th>}
                  {['Name', 'Email', 'Gender', 'Blood Group', 'Phone', 'Appointments'].map((h) => (
                    <th key={h} className="text-left py-3 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {patients.map((p) => (
                  <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50 transition">
                    {showHospital && (
                      <td className="py-3 px-6">
                        <HospitalBadge hospitalId={p.hospitalId} hospitals={hospitals} />
                      </td>
                    )}
                    <td className="py-3 px-6 font-medium text-slate-900">{p.user?.name ?? '—'}</td>
                    <td className="py-3 px-6 text-slate-600 text-sm">{p.user?.email ?? '—'}</td>
                    <td className="py-3 px-6 text-slate-600 capitalize">{p.gender || '—'}</td>
                    <td className="py-3 px-6 text-slate-600">{p.bloodGroup || '—'}</td>
                    <td className="py-3 px-6 text-slate-600 text-sm">{p.user?.phone || '—'}</td>
                    <td className="py-3 px-6 font-semibold text-slate-900">{apptCount.get(p.id) ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AddPatientModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={() => { refetch(); setModalOpen(false); }}
        preselectedHospitalId={selectedHospitalId}
        hospitals={hospitals}
      />
    </DashboardShell>
  );
}
