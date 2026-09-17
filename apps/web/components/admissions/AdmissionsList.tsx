'use client';

/**
 * The single Admissions screen — one component for every role that holds
 * admissions.read, the same way a shared table already serves several roles
 * elsewhere in this app. There is no per-role visual split here the way
 * Appointments has one (patient vs staff): the backend already returns the
 * correctly-scoped set (a doctor's own admissions, everyone else's "all"),
 * so the table is identical, only its contents differ — the "own scope,
 * many possible shapes" case doesn't apply the way it does for a patient's
 * appointment history.
 */

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BedDouble, Eye, Hospital, Search } from 'lucide-react';
import { hasPermission } from '@/lib/auth';
import { fmtDateTime } from '@/lib/date';
import type { RoleViewProps } from '@/components/RoleView';
import { DashboardShell } from '@/components/DashboardShell';
import { ActionIcon } from '@/components/ActionIcon';
import { TablePagination } from '@/components/TablePagination';
import { useServerTable } from '@/hooks/useServerTable';
import { useListAdmissionsPagedQuery } from '@/store/api';
import type { AdmissionStatus } from '@/lib/types';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

const STATUS_TABS: { value: AdmissionStatus | ''; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'admitted', label: 'Admitted' },
  { value: 'discharged', label: 'Discharged' },
  { value: 'dama', label: 'DAMA' },
  { value: 'transferred_out', label: 'Referred' },
  { value: 'deceased', label: 'Deceased' },
];

const STATUS_STYLES: Record<AdmissionStatus, string> = {
  admitted: 'bg-green-100 text-green-700',
  discharged: 'bg-slate-100 text-slate-600',
  dama: 'bg-amber-100 text-amber-700',
  transferred_out: 'bg-blue-100 text-blue-700',
  deceased: 'bg-slate-200 text-slate-700',
};

function StatusBadge({ status }: { status: AdmissionStatus }) {
  const label = STATUS_TABS.find((t) => t.value === status)?.label ?? status;
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[status]}`}>
      {label}
    </span>
  );
}

export function AdmissionsList({ session }: RoleViewProps) {
  const router = useRouter();
  const canAdmit = hasPermission(session, 'admissions.create');
  const [status, setStatus] = useState<AdmissionStatus | ''>('admitted');
  const table = useServerTable({ filterKey: status });

  const { data: page, isLoading } = useListAdmissionsPagedQuery({
    q: table.q.trim() || undefined,
    status: status || undefined,
    limit: table.limit,
    offset: table.offset,
  });
  const admissions = page?.items ?? [];
  const total = page?.total ?? 0;

  return (
    <DashboardShell
      role={session.user.role}
      userName={session.user.name}
      title="Admissions"
      subtitle="In-patient stays at this hospital"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={table.search}
              onChange={(e) => table.setSearch(e.target.value)}
              placeholder="Search by patient name or phone…"
              className="w-full pl-9 pr-3 py-2 bg-white rounded-lg shadow text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {STATUS_TABS.map((t) => (
              <button
                key={t.value || 'all'}
                onClick={() => setStatus(t.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  status === t.value
                    ? 'bg-cyan-600 text-white'
                    : 'bg-white text-slate-600 shadow hover:bg-slate-50'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        {canAdmit && (
          <Link href="/dashboard/admit">
            <Button variant="brand" size="sm">
              <Hospital className="w-4 h-4" /> Admit Patient
            </Button>
          </Link>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <p className="text-sm text-slate-500">
            {total} admission{total !== 1 ? 's' : ''}
          </p>
        </div>

        {isLoading ? (
          <Spinner variant="block" />
        ) : admissions.length === 0 ? (
          <div className="py-16 text-center">
            <BedDouble className="w-16 h-16 text-slate-200 mx-auto mb-4" />
            <p className="text-slate-500">No admissions found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 border-b border-slate-100">
                  <TableHead className="text-left py-3 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wide">Admission #</TableHead>
                  <TableHead className="text-left py-3 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wide">Patient</TableHead>
                  <TableHead className="text-left py-3 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wide">Doctor</TableHead>
                  <TableHead className="text-left py-3 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wide">Ward / Bed</TableHead>
                  <TableHead className="text-left py-3 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wide">Admitted</TableHead>
                  <TableHead className="text-left py-3 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</TableHead>
                  <TableHead className="text-right py-3 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wide">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {admissions.map((a) => (
                  <TableRow
                    key={a.id}
                    className="border-b border-slate-50 hover:bg-slate-50 transition cursor-pointer"
                    onClick={() => router.push(`/dashboard/ipd/${a.id}`)}
                  >
                    <TableCell className="py-3 px-6 font-mono text-xs text-slate-500 whitespace-normal">{a.admissionNumber}</TableCell>
                    <TableCell className="py-3 px-6 whitespace-normal">
                      <p className="font-medium text-slate-900">{a.patientName || '—'}</p>
                      <p className="text-xs text-slate-400">{a.patientPhone}</p>
                    </TableCell>
                    <TableCell className="py-3 px-6 text-slate-600 text-sm whitespace-normal">
                      {a.doctorName ? `Dr. ${a.doctorName}` : '—'}
                    </TableCell>
                    <TableCell className="py-3 px-6 text-slate-600 text-sm whitespace-normal">
                      {a.wardName || '—'}{a.bedNumber ? ` · Bed ${a.bedNumber}` : ''}
                    </TableCell>
                    <TableCell className="py-3 px-6 text-slate-600 text-sm whitespace-normal">{fmtDateTime(a.admittedAt)}</TableCell>
                    <TableCell className="py-3 px-6 whitespace-normal">
                      <StatusBadge status={a.status} />
                    </TableCell>
                    <TableCell className="py-3 px-6 text-right whitespace-normal" onClick={(e) => e.stopPropagation()}>
                      <ActionIcon
                        icon={Eye}
                        label="Open"
                        onClick={() => router.push(`/dashboard/ipd/${a.id}`)}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <TablePagination
              page={table.page}
              pageSize={table.pageSize}
              total={total}
              onPageChange={table.setPage}
            />
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
