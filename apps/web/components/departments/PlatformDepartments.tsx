'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Globe, Plus } from 'lucide-react';
import { DashboardShell } from '@/components/DashboardShell';
import type { RoleViewProps } from '@/components/RoleView';
import { AddDepartmentModal } from '@/components/superadmin/AddDepartmentModal';
import { HospitalBadge } from '@/components/superadmin/HospitalBadge';
import { useGetSuperadminDepartmentsQuery, useListHospitalsQuery } from '@/store/api';

export function PlatformDepartments({ session }: RoleViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedHospitalId = searchParams.get('h') ?? '';

  const [modalOpen, setModalOpen] = useState(false);

  const { data: allDepartments = [], isLoading, refetch } = useGetSuperadminDepartmentsQuery();
  const { data: hospitals = [] } = useListHospitalsQuery();

  const departments = selectedHospitalId
    ? allDepartments.filter((d) => d.hospitalId === selectedHospitalId)
    : allDepartments;

  const showHospital = !selectedHospitalId;

  return (
    <DashboardShell
      role={session.user.role}
      userName={session.user.name}
      title="All Departments"
      subtitle={selectedHospitalId ? 'Filtered by selected hospital' : 'Across every hospital on the platform'}
    >
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <p className="text-sm text-slate-500">
            {departments.length} department{departments.length !== 1 ? 's' : ''}
            {selectedHospitalId && <span className="text-slate-400"> (filtered)</span>}
          </p>
          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-700 transition"
          >
            <Plus className="w-4 h-4" /> Add Department
          </button>
        </div>
        {isLoading ? (
          <div className="py-16 text-center text-slate-400 text-sm">Loading…</div>
        ) : departments.length === 0 ? (
          <div className="py-16 text-center">
            <Globe className="w-16 h-16 text-slate-200 mx-auto mb-4" />
            <p className="text-slate-500">No departments found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {showHospital && <th className="text-left py-3 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wide">Hospital</th>}
                  {['Name', 'Description'].map((h) => (
                    <th key={h} className="text-left py-3 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {departments.map((d) => (
                  <tr key={d.id} className="border-b border-slate-50 hover:bg-slate-50 transition">
                    {showHospital && (
                      <td className="py-3 px-6">
                        <HospitalBadge hospitalId={d.hospitalId} hospitals={hospitals} />
                      </td>
                    )}
                    <td className="py-3 px-6 font-medium text-slate-900">{d.name}</td>
                    <td className="py-3 px-6 text-slate-600 text-sm">{d.description || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AddDepartmentModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={() => { refetch(); setModalOpen(false); }}
        preselectedHospitalId={selectedHospitalId}
        hospitals={hospitals}
      />
    </DashboardShell>
  );
}
