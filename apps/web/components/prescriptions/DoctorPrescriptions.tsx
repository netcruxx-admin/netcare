'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { ActionIcon } from '@/components/ActionIcon';
import { Search, Pill, Eye } from 'lucide-react';
import type { Prescription } from '@/lib/types';
import { useLazyListPrescriptionsPagedQuery, useListPrescriptionsPagedQuery } from '@/store/api';
import { DashboardShell } from '@/components/DashboardShell';
import type { RoleViewProps } from '@/components/RoleView';
import { ExportButton } from '@/components/ExportButton';
import { TablePagination } from '@/components/TablePagination';
import { useServerTable } from '@/hooks/useServerTable';
import { fmtDate } from '@/lib/date';
import { Spinner } from '@/components/ui/spinner';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

const toRow = (rx: Prescription) => ({
  ...rx,
  // Resolved by the API — this screen no longer fetches every patient the
  // doctor treats just to put a name beside a medicine.
  patient: rx.patientName || 'Patient',
  date: fmtDate(rx.createdAt),
});

const exportRow = (r: ReturnType<typeof toRow>) => [
  r.date, r.patient, r.medicineName, r.dosage, r.frequency, r.duration, r.instructions,
];

export function DoctorPrescriptions({ session }: RoleViewProps) {
  const table = useServerTable();

  // Already narrowed to this doctor's own records by the API, and searched,
  // sorted and paged there too.
  const listArgs = { q: table.q.trim() || undefined };
  const { data: prescriptionPage, isLoading } = useListPrescriptionsPagedQuery({
    ...listArgs,
    limit: table.limit,
    offset: table.offset,
  });
  const totalPrescriptions = prescriptionPage?.total ?? 0;
  const [fetchAllForExport] = useLazyListPrescriptionsPagedQuery();

  const rows = useMemo(() => (prescriptionPage?.items ?? []).map(toRow), [prescriptionPage]);

  return (
    <DashboardShell role={session.user.role} userName={session.user.name} title="Prescriptions" subtitle="Medicines you have prescribed">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={table.search}
              onChange={(e) => table.setSearch(e.target.value)}
              placeholder="Search patient or medicine…"
              className="w-full pl-9 pr-3 py-2 bg-white rounded-lg shadow text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>
          <ExportButton
            filename="prescriptions"
            headers={['Date', 'Patient', 'Medicine', 'Dosage', 'Frequency', 'Duration', 'Instructions']}
            rows={rows.map(exportRow)}
            getRows={async () => {
              const all = await fetchAllForExport(listArgs).unwrap();
              return all.items.map(toRow).map(exportRow);
            }}
          />
        </div>

        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b">
            <h3 className="font-semibold text-slate-900">Prescriptions ({totalPrescriptions})</h3>
          </div>

          {isLoading ? (
            <Spinner variant="block" />
          ) : rows.length === 0 ? (
            <div className="text-center py-16">
              <Pill className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-600">No prescriptions yet. Add one from an appointment.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-b bg-slate-50">
                    <TableHead className="text-left py-3 px-6 font-semibold text-slate-900">Date</TableHead>
                    <TableHead className="text-left py-3 px-6 font-semibold text-slate-900">Patient</TableHead>
                    <TableHead className="text-left py-3 px-6 font-semibold text-slate-900">Medicine</TableHead>
                    <TableHead className="text-left py-3 px-6 font-semibold text-slate-900">Dosage</TableHead>
                    <TableHead className="text-left py-3 px-6 font-semibold text-slate-900">Frequency</TableHead>
                    <TableHead className="text-left py-3 px-6 font-semibold text-slate-900">Duration</TableHead>
                    <TableHead className="text-right py-3 px-6 font-semibold text-slate-900">Visit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id} className="border-b hover:bg-slate-50">
                      <TableCell className="py-3 px-6 text-slate-600">{r.date}</TableCell>
                      <TableCell className="py-3 px-6 font-medium text-slate-900 whitespace-normal">{r.patient}</TableCell>
                      <TableCell className="py-3 px-6 whitespace-normal">
                        <span className="inline-flex items-center gap-1.5 text-slate-900 font-medium">
                          <Pill className="w-4 h-4 text-cyan-600" /> {r.medicineName}
                        </span>
                        {r.instructions && <p className="text-xs text-slate-500 mt-0.5">{r.instructions}</p>}
                      </TableCell>
                      <TableCell className="py-3 px-6 text-slate-600 whitespace-normal">{r.dosage}</TableCell>
                      <TableCell className="py-3 px-6 text-slate-600 whitespace-normal">{r.frequency}</TableCell>
                      <TableCell className="py-3 px-6 text-slate-600 whitespace-normal">{r.duration}</TableCell>
                      <TableCell className="py-3 px-6 text-right whitespace-normal">
                        <Link href={`/appointment/${r.appointmentId}`}>
                          <ActionIcon icon={Eye} label="View appointment" />
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <TablePagination
                page={table.page}
                pageSize={table.pageSize}
                total={totalPrescriptions}
                onPageChange={table.setPage}
              />
            </div>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
