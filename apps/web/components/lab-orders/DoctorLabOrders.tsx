'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, ClipboardList, AlertTriangle, Eye } from 'lucide-react';
import { toast } from 'sonner';
import type { TestOrder } from '@/lib/types';
import { apiError } from '@/lib/apiError';
import {
  useLazyListTestOrdersPagedQuery,
  useListTestOrdersPagedQuery,
  useReviewTestOrderMutation,
} from '@/store/api';
import { ActionIcon } from '@/components/ActionIcon';
import { DashboardShell } from '@/components/DashboardShell';
import type { RoleViewProps } from '@/components/RoleView';
import { ExportButton } from '@/components/ExportButton';
import { TablePagination } from '@/components/TablePagination';
import { useServerTable } from '@/hooks/useServerTable';
import { ORDER_STATUS_LABEL, ORDER_STATUS_STYLE } from '@/lib/lab';

/**
 * `patientName`, `hasResults` and `abnormal` all arrive on the order. This
 * screen used to fetch every patient and every test result in the hospital to
 * work out the same three things.
 */
const toRow = (o: TestOrder) => ({
  order: o,
  patient: o.patientName || 'Patient',
  tests: o.items.map((i) => i.name).join(', '),
  hasResults: o.hasResults ?? false,
  abnormal: o.abnormal ?? false,
});

const exportRow = (r: ReturnType<typeof toRow>) => [
  r.order.id, r.patient, r.tests, r.order.status, r.abnormal ? 'Yes' : 'No',
];

export function DoctorLabOrders({ session }: RoleViewProps) {
  const [statusFilter, setStatusFilter] = useState('all');
  const table = useServerTable({ filterKey: statusFilter });

  // Already narrowed to this doctor's own work by the API, and searched,
  // filtered, sorted and paged there too.
  const listArgs = {
    q: table.q.trim() || undefined,
    status: statusFilter === 'all' ? undefined : statusFilter,
  };
  const { data: orderPage } = useListTestOrdersPagedQuery({
    ...listArgs,
    limit: table.limit,
    offset: table.offset,
  });
  const totalOrders = orderPage?.total ?? 0;
  const [fetchAllForExport] = useLazyListTestOrdersPagedQuery();
  const [reviewTestOrder, { isLoading: isReviewing }] = useReviewTestOrderMutation();

  const markReviewed = async (id: string) => {
    try {
      await reviewTestOrder(id).unwrap();
      toast.success('Report marked as reviewed');
    } catch (err) {
      toast.error(apiError(err, 'Could not mark the report reviewed'));
    }
  };

  const rows = useMemo(() => (orderPage?.items ?? []).map(toRow), [orderPage]);

  return (
    <DashboardShell role={session.user.role} userName={session.user.name} title="Lab Orders" subtitle="Tests you have ordered and their reports">
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
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-white rounded-lg shadow px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          >
            <option value="all">All Statuses</option>
            <option value="ordered">Ordered</option>
            <option value="sample_collected">Sample Collected</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="reviewed">Reviewed</option>
          </select>
          <ExportButton
            filename="my-lab-orders"
            headers={['Order', 'Patient', 'Tests', 'Status', 'Abnormal']}
            rows={rows.map(exportRow)}
            getRows={async () => {
              const all = await fetchAllForExport(listArgs).unwrap();
              return all.items.map(toRow).map(exportRow);
            }}
          />
        </div>

        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b">
            <h3 className="font-semibold text-slate-900">Orders ({totalOrders})</h3>
          </div>
          {rows.length === 0 ? (
            <div className="text-center py-16">
              <ClipboardList className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-600">You haven't ordered any tests yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-slate-50">
                    <th className="text-left py-3 px-6 font-semibold text-slate-900">Patient</th>
                    <th className="text-left py-3 px-6 font-semibold text-slate-900">Tests</th>
                    <th className="text-left py-3 px-6 font-semibold text-slate-900">Status</th>
                    <th className="text-right py-3 px-6 font-semibold text-slate-900">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.order.id} className="border-b hover:bg-slate-50">
                      <td className="py-3 px-6">
                        <p className="font-medium text-slate-900">{r.patient}</p>
                        <p className="text-xs text-slate-400 font-mono">{r.order.id}</p>
                      </td>
                      <td className="py-3 px-6 text-slate-600 max-w-xs">
                        {r.tests}
                        {r.abnormal && (
                          <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 align-middle">
                            <AlertTriangle className="w-3 h-3" /> Abnormal
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-6">
                        <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${ORDER_STATUS_STYLE[r.order.status]}`}>
                          {ORDER_STATUS_LABEL[r.order.status]}
                        </span>
                      </td>
                      <td className="py-3 px-6 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          {r.hasResults && (
                            <Link href={`/report/${r.order.id}`}>
                              <ActionIcon icon={Eye} label="View report" />
                            </Link>
                          )}
                          {r.order.status === 'completed' && (
                            <button
                              onClick={() => markReviewed(r.order.id)}
                              disabled={isReviewing}
                              className="text-purple-600 hover:text-purple-700 font-semibold text-sm disabled:opacity-50"
                            >
                              {isReviewing ? 'Saving…' : 'Mark Reviewed'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <TablePagination
                page={table.page}
                pageSize={table.pageSize}
                total={totalOrders}
                onPageChange={table.setPage}
              />
            </div>
          )}
        </div>
      </div>

    </DashboardShell>
  );
}
