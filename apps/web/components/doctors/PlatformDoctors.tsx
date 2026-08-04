'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Stethoscope, Plus, Search, Pencil, Trash2 } from 'lucide-react';
import { DashboardShell } from '@/components/DashboardShell';
import type { RoleViewProps } from '@/components/RoleView';
import { AddDoctorModal } from '@/components/superadmin/AddDoctorModal';
import { EditDoctorModal } from '@/components/doctors/EditDoctorModal';
import { DeleteDoctorModal } from '@/components/doctors/DeleteDoctorModal';
import { HospitalBadge } from '@/components/superadmin/HospitalBadge';
import { ActionIcon } from '@/components/ActionIcon';
import { TablePagination } from '@/components/TablePagination';
import { useServerTable } from '@/hooks/useServerTable';
import { hasPermission } from '@/lib/auth';
import type { Doctor } from '@/lib/types';
import {
  useGetSuperadminDoctorsPagedQuery,
  useListHospitalsQuery,
} from '@/store/api';

export function PlatformDoctors({ session }: RoleViewProps) {
  const searchParams = useSearchParams();
  const selectedHospitalId = searchParams.get('h') ?? '';

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editing, setEditing] = useState<Doctor | null>(null);
  const [deleting, setDeleting] = useState<Doctor | null>(null);

  const table = useServerTable({ filterKey: selectedHospitalId });
  const { data: doctorPage, isLoading, refetch } = useGetSuperadminDoctorsPagedQuery({
    q: table.q.trim() || undefined,
    hospitalId: selectedHospitalId || undefined,
    limit: table.limit,
    offset: table.offset,
  });
  const doctors = doctorPage?.items ?? [];
  const totalDoctors = doctorPage?.total ?? 0;
  const { data: hospitals = [] } = useListHospitalsQuery();

  const showHospital = !selectedHospitalId;
  const canManage = hasPermission(session, 'doctors.manage');

  return (
    <DashboardShell
      role={session.user.role}
      userName={session.user.name}
      title="All Doctors"
      subtitle={selectedHospitalId ? 'Filtered by selected hospital' : 'Across every hospital on the platform'}
    >
      {/* Search toolbar */}
      <div className="mb-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={table.search}
            onChange={(e) => table.setSearch(e.target.value)}
            placeholder="Search by name, email or specialization…"
            className="w-full pl-9 pr-3 py-2 bg-white rounded-lg shadow text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <p className="text-sm text-slate-500">
            {totalDoctors} doctor{totalDoctors !== 1 ? 's' : ''}
            {(selectedHospitalId || table.search) && <span className="text-slate-400"> (filtered)</span>}
          </p>
          {canManage && (
            <button
              onClick={() => setAddModalOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-cyan-500 to-brand-teal text-white rounded-lg text-sm font-medium hover:shadow-lg transition"
            >
              <Plus className="w-4 h-4" /> Add Doctor
            </button>
          )}
        </div>
        {isLoading ? (
          <div className="py-16 text-center text-slate-400 text-sm">Loading…</div>
        ) : doctors.length === 0 ? (
          <div className="py-16 text-center">
            <Stethoscope className="w-16 h-16 text-slate-200 mx-auto mb-4" />
            <p className="text-slate-500">No doctors found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {showHospital && <th className="text-left py-3 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wide">Hospital</th>}
                  {['Name', 'Email', 'Specialization', 'Qualification', 'Experience'].map((h) => (
                    <th key={h} className="text-left py-3 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                  ))}
                  <th className="text-right py-3 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody>
                {doctors.map((d) => (
                  <tr key={d.id} className="border-b border-slate-50 hover:bg-slate-50 transition">
                    {showHospital && (
                      <td className="py-3 px-6">
                        <HospitalBadge hospitalId={d.hospitalId} hospitals={hospitals} />
                      </td>
                    )}
                    <td className="py-3 px-6 font-medium text-slate-900">{d.user?.name ?? '—'}</td>
                    <td className="py-3 px-6 text-slate-600 text-sm">{d.user?.email ?? '—'}</td>
                    <td className="py-3 px-6 text-slate-600">{d.specialization || '—'}</td>
                    <td className="py-3 px-6 text-slate-600">{d.qualification || '—'}</td>
                    <td className="py-3 px-6 text-slate-600">{d.experienceYears != null ? `${d.experienceYears} yrs` : '—'}</td>
                    <td className="py-3 px-6 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {canManage && <ActionIcon icon={Pencil} label="Edit" onClick={() => setEditing(d)} />}
                        {canManage && <ActionIcon icon={Trash2} label="Delete" tone="danger" onClick={() => setDeleting(d)} />}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <TablePagination
              page={table.page}
              pageSize={table.pageSize}
              total={totalDoctors}
              onPageChange={table.setPage}
            />
          </div>
        )}
      </div>

      <AddDoctorModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onSuccess={refetch}
        preselectedHospitalId={selectedHospitalId}
        hospitals={hospitals}
      />
      <EditDoctorModal
        doctor={editing}
        onClose={() => setEditing(null)}
        onSuccess={refetch}
        hospitalId={editing?.hospitalId}
      />
      <DeleteDoctorModal
        doctor={deleting}
        onClose={() => setDeleting(null)}
        onSuccess={refetch}
        hospitalId={deleting?.hospitalId}
      />
    </DashboardShell>
  );
}
