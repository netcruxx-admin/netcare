'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { UserRound, Plus, Search, Eye, Pencil, Trash2 } from 'lucide-react';
import { DashboardShell } from '@/components/DashboardShell';
import type { RoleViewProps } from '@/components/RoleView';
import { AddPatientModal } from '@/components/superadmin/AddPatientModal';
import { EditPatientModal } from '@/components/patients/EditPatientModal';
import { DeletePatientModal } from '@/components/patients/DeletePatientModal';
import { HospitalBadge } from '@/components/superadmin/HospitalBadge';
import { ActionIcon } from '@/components/ActionIcon';
import { TablePagination } from '@/components/TablePagination';
import { useServerTable } from '@/hooks/useServerTable';
import { hasPermission } from '@/lib/auth';
import { fmtAge } from '@/lib/date';
import { formatRelationLine } from '@/components/patients/patientProfile';
import type { Patient } from '@/lib/types';
import {
  useGetSuperadminPatientsPagedQuery,
  useListHospitalsQuery,
} from '@/store/api';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

export function PlatformPatients({ session }: RoleViewProps) {
  const searchParams = useSearchParams();
  const selectedHospitalId = searchParams.get('h') ?? '';

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editing, setEditing] = useState<Patient | null>(null);
  const [deleting, setDeleting] = useState<Patient | null>(null);

  // The hospital filter, the search and the paging are all applied by the API.
  // This screen spans every tenant on the platform, so it is the one that most
  // needs to stop downloading the whole table to filter four fields of it.
  const table = useServerTable({ filterKey: selectedHospitalId });
  const { data: patientPage, isLoading, refetch } = useGetSuperadminPatientsPagedQuery({
    q: table.q.trim() || undefined,
    hospitalId: selectedHospitalId || undefined,
    withStats: true,
    limit: table.limit,
    offset: table.offset,
  });
  const patients = patientPage?.items ?? [];
  const totalPatients = patientPage?.total ?? 0;
  const { data: hospitals = [] } = useListHospitalsQuery();

  const showHospital = !selectedHospitalId;

  return (
    <DashboardShell
      role={session.user.role}
      userName={session.user.name}
      title="All Patients"
      subtitle={selectedHospitalId ? 'Filtered by selected hospital' : 'Across every hospital on the platform'}
    >
      {/* Search toolbar */}
      <div className="mb-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={table.search}
            onChange={(e) => table.setSearch(e.target.value)}
            placeholder="Search by name, email, gender or blood group…"
            className="w-full pl-9 pr-3 py-2 bg-white rounded-lg shadow text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <p className="text-sm text-slate-500">
            {totalPatients} patient{totalPatients !== 1 ? 's' : ''}
            {(selectedHospitalId || table.search) && <span className="text-slate-400"> (filtered)</span>}
          </p>
          {hasPermission(session, 'patients.manage') && (
            <Button
              onClick={() => setAddModalOpen(true)}
              variant="brand"
              size="sm"
            >
              <Plus className="w-4 h-4" /> Add Patient
            </Button>
          )}
        </div>
        {isLoading ? (
          <Spinner variant="block" />
        ) : patients.length === 0 ? (
          <div className="py-16 text-center">
            <UserRound className="w-16 h-16 text-slate-200 mx-auto mb-4" />
            <p className="text-slate-500">No patients found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 border-b border-slate-100">
                  {showHospital && <TableHead className="text-left py-3 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wide">Hospital</TableHead>}
                  {/* "Visits", not "Appointments": the API counts completed ones. */}
                  {['Name', 'Email', 'Gender', 'Age', 'Blood Group', 'Phone', 'Visits'].map((h) => (
                    <TableHead key={h} className="text-left py-3 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</TableHead>
                  ))}
                  <TableHead className="text-right py-3 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wide">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {patients.map((p) => (
                  <TableRow key={p.id} className="border-b border-slate-50 hover:bg-slate-50 transition">
                    {showHospital && (
                      <TableCell className="py-3 px-6 whitespace-normal">
                        <HospitalBadge hospitalId={p.hospitalId} hospitals={hospitals} />
                      </TableCell>
                    )}
                    <TableCell className="py-3 px-6 font-medium text-slate-900 whitespace-normal">
                      {p.user?.name ?? '—'}
                      {formatRelationLine(p.relationType, p.relationName) && (
                        <span className="block text-xs font-normal text-slate-500">
                          {formatRelationLine(p.relationType, p.relationName)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="py-3 px-6 text-slate-600 text-sm whitespace-normal">{p.user?.email ?? '—'}</TableCell>
                    <TableCell className="py-3 px-6 text-slate-600 capitalize whitespace-normal">{p.gender || '—'}</TableCell>
                    <TableCell className="py-3 px-6 text-slate-600 whitespace-normal">{fmtAge(p.dateOfBirth)}</TableCell>
                    <TableCell className="py-3 px-6 text-slate-600 whitespace-normal">{p.bloodGroup || '—'}</TableCell>
                    <TableCell className="py-3 px-6 text-slate-600 text-sm whitespace-normal">{p.user?.phone || '—'}</TableCell>
                    <TableCell className="py-3 px-6 font-semibold text-slate-900 whitespace-normal">{p.visitCount ?? 0}</TableCell>
                    <TableCell className="py-3 px-6 text-right whitespace-normal">
                      <div className="flex items-center justify-end gap-1">
                        <ActionIcon icon={Eye} label="View" href={`/patient/${p.id}${p.hospitalId ? `?h=${p.hospitalId}` : ''}`} />
                        {hasPermission(session, 'patients.manage') && <ActionIcon icon={Pencil} label="Edit" onClick={() => setEditing(p)} />}
                        {hasPermission(session, 'patients.delete') && <ActionIcon icon={Trash2} label="Delete" tone="danger" onClick={() => setDeleting(p)} />}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <TablePagination
              page={table.page}
              pageSize={table.pageSize}
              total={totalPatients}
              onPageChange={table.setPage}
            />
          </div>
        )}
      </div>

      <AddPatientModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onSuccess={refetch}
        preselectedHospitalId={selectedHospitalId}
        hospitals={hospitals}
      />
      <EditPatientModal
        patient={editing}
        onClose={() => setEditing(null)}
        onSuccess={refetch}
        hospitalId={editing?.hospitalId}
      />
      <DeletePatientModal
        patient={deleting}
        onClose={() => setDeleting(null)}
        onSuccess={refetch}
        hospitalId={deleting?.hospitalId}
      />
    </DashboardShell>
  );
}
