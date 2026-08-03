'use client';

import { useMemo, useState } from 'react';
import { Stethoscope, Search } from 'lucide-react';
import { DashboardShell } from '@/components/DashboardShell';
import type { RoleViewProps } from '@/components/RoleView';
import { ExportButton } from '@/components/ExportButton';
import { TablePagination } from '@/components/TablePagination';
import { useServerTable } from '@/hooks/useServerTable';
import type { Doctor } from '@/lib/types';
import {
  useLazyListDoctorsPagedQuery,
  useListDoctorsPagedQuery,
  useListDepartmentsQuery,
} from '@/store/api';

const exportRow = (d: Doctor) => [
  d.user?.name ?? '—',
  d.user?.email ?? '—',
  d.specialization,
  d.qualification,
  d.experienceYears,
  d.consultationFee,
  d.verificationStatus ?? 'verified',
];

export function AdminDoctors({ session }: RoleViewProps) {
  const [specFilter, setSpecFilter] = useState('all');
  const table = useServerTable({ filterKey: specFilter });

  const listArgs = {
    q: table.q.trim() || undefined,
    specialization: specFilter === 'all' ? undefined : specFilter,
  };
  const { data: doctorPage } = useListDoctorsPagedQuery({
    ...listArgs,
    limit: table.limit,
    offset: table.offset,
  });
  const filtered = doctorPage?.items ?? [];
  const totalDoctors = doctorPage?.total ?? 0;
  const [fetchAllForExport] = useLazyListDoctorsPagedQuery();
  const { data: departments = [] } = useListDepartmentsQuery();

  // Options come from the department catalog, not from the doctors on screen:
  // a filter built from one page would only ever offer that page's values.
  const specializations = useMemo(
    () => [...new Set(departments.map((d) => d.name).filter(Boolean))].sort(),
    [departments],
  );

  return (
    <DashboardShell
      role={session.user.role}
      userName={session.user.name}
      title="Doctors"
      subtitle="Manage doctor profiles"
    >
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={table.search}
            onChange={(e) => table.setSearch(e.target.value)}
            placeholder="Search name, email, specialization…"
            className="w-full pl-9 pr-3 py-2 bg-white rounded-lg shadow text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
        </div>
        <select
          value={specFilter}
          onChange={(e) => setSpecFilter(e.target.value)}
          className="bg-white rounded-lg shadow px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-500"
        >
          <option value="all">All Specializations</option>
          {specializations.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <ExportButton
          filename="doctors"
          headers={['Name', 'Email', 'Specialization', 'Qualification', 'Experience (yrs)', 'Fee', 'Status']}
          rows={filtered.map(exportRow)}
          getRows={async () => {
            const all = await fetchAllForExport(listArgs).unwrap();
            return all.items.map(exportRow);
          }}
        />
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b">
          <h3 className="text-lg font-semibold text-slate-900">Doctors ({totalDoctors})</h3>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-16">
            <Stethoscope className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-600">No doctors found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-slate-50">
                  <th className="text-left py-3 px-6 font-semibold text-slate-900">Name</th>
                  <th className="text-left py-3 px-6 font-semibold text-slate-900">Email</th>
                  <th className="text-left py-3 px-6 font-semibold text-slate-900">Specialization</th>
                  <th className="text-left py-3 px-6 font-semibold text-slate-900">Qualification</th>
                  <th className="text-left py-3 px-6 font-semibold text-slate-900">Experience</th>
                  <th className="text-left py-3 px-6 font-semibold text-slate-900">Fee</th>
                  <th className="text-left py-3 px-6 font-semibold text-slate-900">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((doctor) => (
                  <tr key={doctor.id} className="border-b hover:bg-slate-50">
                    <td className="py-3 px-6 font-medium text-slate-900">{doctor.user?.name ?? '—'}</td>
                    <td className="py-3 px-6 text-slate-600 text-sm">{doctor.user?.email ?? '—'}</td>
                    <td className="py-3 px-6 font-medium">{doctor.specialization || '—'}</td>
                    <td className="py-3 px-6 text-slate-600">{doctor.qualification || '—'}</td>
                    <td className="py-3 px-6 text-slate-600">{doctor.experienceYears} yrs</td>
                    <td className="py-3 px-6 text-slate-600">₹{doctor.consultationFee}</td>
                    <td className="py-3 px-6">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        doctor.verificationStatus === 'verified'
                          ? 'bg-green-100 text-green-700'
                          : doctor.verificationStatus === 'pending'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-red-100 text-red-700'
                      }`}>
                        {doctor.verificationStatus ?? 'verified'}
                      </span>
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
    </DashboardShell>
  );
}
