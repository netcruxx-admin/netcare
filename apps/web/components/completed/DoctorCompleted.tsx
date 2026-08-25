'use client';

import Link from 'next/link';
import { CheckCircle, Eye } from 'lucide-react';
import { useLazyListAppointmentsPagedQuery, useListAppointmentsPagedQuery } from '@/store/api';
import { fmtDate } from '@/lib/date';
import { DashboardShell } from '@/components/DashboardShell';
import { ActionIcon } from '@/components/ActionIcon';
import { TablePagination } from '@/components/TablePagination';
import { ExportButton } from '@/components/ExportButton';
import { useServerTable } from '@/hooks/useServerTable';
import type { RoleViewProps } from '@/components/RoleView';
import { Spinner } from '@/components/ui/spinner';

export function DoctorCompleted({ session }: RoleViewProps) {
  const table = useServerTable();

  // Filtered server-side — no client-side filtering of the full appointment list.
  const listArgs = { status: 'completed' };
  const { data: page, isLoading } = useListAppointmentsPagedQuery({
    ...listArgs,
    limit: table.limit,
    offset: table.offset,
  });
  const appointments = page?.items ?? [];
  const total = page?.total ?? 0;
  const [fetchAllForExport] = useLazyListAppointmentsPagedQuery();

  return (
    <DashboardShell
      role={session.user.role}
      userName={session.user.name}
      title="Completed Visits"
      subtitle="Appointments you have completed"
    >
      <div className="space-y-4">
        <div className="flex justify-end">
          <ExportButton
            filename="completed-visits"
            headers={['Date', 'Time', 'Patient', 'Reason']}
            rows={appointments.map((a) => [fmtDate(a.date), a.time, a.patientName ?? 'Patient', a.reason || '—'])}
            getRows={async () => {
              const all = await fetchAllForExport(listArgs).unwrap();
              return all.items.map((a) => [fmtDate(a.date), a.time, a.patientName ?? 'Patient', a.reason || '—']);
            }}
          />
        </div>

        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b">
            <h3 className="font-semibold text-slate-900">Completed ({total})</h3>
          </div>

          {isLoading ? (
            <Spinner variant="block" />
          ) : appointments.length === 0 ? (
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
                  {appointments.map((apt) => (
                    <tr key={apt.id} className="border-b hover:bg-slate-50">
                      <td className="py-3 px-6 font-medium">{fmtDate(apt.date)} at {apt.time}</td>
                      <td className="py-3 px-6 text-slate-600">{apt.patientName ?? 'Patient'}</td>
                      <td className="py-3 px-6 text-slate-600">{apt.reason || '—'}</td>
                      <td className="py-3 px-6 text-right">
                        <Link href={`/appointment/${apt.id}`}>
                          <ActionIcon icon={Eye} label="View appointment" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <TablePagination
                page={table.page}
                pageSize={table.pageSize}
                total={total}
                onPageChange={table.setPage}
              />
            </div>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
