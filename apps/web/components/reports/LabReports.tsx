'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { Search, FileBarChart, AlertTriangle } from 'lucide-react';
import type { TestOrder } from '@/lib/types';
import { useLazyListTestOrdersPagedQuery, useListTestOrdersPagedQuery } from '@/store/api';
import { DashboardShell } from '@/components/DashboardShell';
import type { RoleViewProps } from '@/components/RoleView';
import { ExportButton } from '@/components/ExportButton';
import { TablePagination } from '@/components/TablePagination';
import { useServerTable } from '@/hooks/useServerTable';
import { ORDER_STATUS_LABEL, ORDER_STATUS_STYLE } from '@/lib/lab';

/** A published report is an order in one of these two states. */
const PUBLISHED = 'completed,reviewed';

const toRow = (o: TestOrder) => ({
  order: o,
  // Name, abnormal flag and reporting details all arrive on the order, so this
  // screen no longer downloads every patient and every result to derive them.
  patient: o.patientName || 'Patient',
  tests: o.items.map((i) => i.name).join(', '),
  abnormal: o.abnormal ?? false,
  reportedBy: o.reportedBy || '—',
  reportedAt: o.reportedAt?.split('T')[0] || '—',
});

const exportRow = (r: ReturnType<typeof toRow>) => [
  r.order.id, r.patient, r.tests, r.reportedAt, r.reportedBy, r.order.status,
  r.abnormal ? 'Yes' : 'No',
];

export function LabReports({ session }: RoleViewProps) {
  const table = useServerTable();

  const listArgs = { q: table.q.trim() || undefined, status: PUBLISHED };
  const { data: orderPage } = useListTestOrdersPagedQuery({
    ...listArgs,
    limit: table.limit,
    offset: table.offset,
  });
  const totalReports = orderPage?.total ?? 0;
  const [fetchAllForExport] = useLazyListTestOrdersPagedQuery();

  const rows = useMemo(() => (orderPage?.items ?? []).map(toRow), [orderPage]);

  return (
    <DashboardShell role={session.user.role} userName={session.user.name} title="Reports" subtitle="Published lab reports">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={table.search}
              onChange={(e) => table.setSearch(e.target.value)}
              placeholder="Search patient or test…"
              className="w-full pl-9 pr-3 py-2 bg-white rounded-lg shadow text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>
          <ExportButton
            filename="published-reports"
            headers={['Order', 'Patient', 'Tests', 'Reported', 'Reported By', 'Status', 'Abnormal']}
            rows={rows.map(exportRow)}
            getRows={async () => {
              const all = await fetchAllForExport(listArgs).unwrap();
              return all.items.map(toRow).map(exportRow);
            }}
          />
        </div>

        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b">
            <h3 className="font-semibold text-slate-900">Published Reports ({totalReports})</h3>
          </div>
          {rows.length === 0 ? (
            <div className="text-center py-16">
              <FileBarChart className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-600">No published reports yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-slate-50">
                    <th className="text-left py-3 px-6 font-semibold text-slate-900">Patient</th>
                    <th className="text-left py-3 px-6 font-semibold text-slate-900">Tests</th>
                    <th className="text-left py-3 px-6 font-semibold text-slate-900">Reported</th>
                    <th className="text-left py-3 px-6 font-semibold text-slate-900">Status</th>
                    <th className="text-right py-3 px-6 font-semibold text-slate-900">Report</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.order.id} className="border-b hover:bg-slate-50">
                      <td className="py-3 px-6 font-medium text-slate-900">{r.patient}</td>
                      <td className="py-3 px-6 text-slate-600 max-w-xs">
                        {r.tests}
                        {r.abnormal && (
                          <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 align-middle">
                            <AlertTriangle className="w-3 h-3" /> Abnormal
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-6 text-slate-600 whitespace-nowrap">{r.reportedAt}</td>
                      <td className="py-3 px-6">
                        <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${ORDER_STATUS_STYLE[r.order.status]}`}>
                          {ORDER_STATUS_LABEL[r.order.status]}
                        </span>
                      </td>
                      <td className="py-3 px-6 text-right">
                        <Link href={`/report/${r.order.id}`} className="text-cyan-600 hover:text-cyan-700 font-semibold text-sm">
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <TablePagination
                page={table.page}
                pageSize={table.pageSize}
                total={totalReports}
                onPageChange={table.setPage}
              />
            </div>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
