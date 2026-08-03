'use client';

import { useEffect, useMemo, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Search, ClipboardList, ClipboardEdit, FileText, Trash2, X, AlertTriangle } from 'lucide-react';
import type { TestOrder, TestOrderStatus, TestResult, TestResultParameter } from '@/lib/types';
import { apiError } from '@/lib/apiError';
import {
  useDeleteTestOrderMutation,
  useListLabTestsQuery,
  useListTestOrdersPagedQuery,
  useLazyListTestResultsQuery,
  useUpdateTestOrderMutation,
  useUpsertTestResultMutation,
} from '@/store/api';
import { DashboardShell } from '@/components/DashboardShell';
import type { RoleViewProps } from '@/components/RoleView';
import { ExportButton } from '@/components/ExportButton';
import { TablePagination } from '@/components/TablePagination';
import { useDebounced } from '@/hooks/useDebounced';

/** Rows per page for the orders table. */
const PAGE_SIZE = 20;
import {
  ORDER_STATUS_LABEL,
  ORDER_STATUS_STYLE,
  nextLabStatus,
  computeFlag,
  FLAG_STYLE,
  FLAG_LABEL,
  type ResultFlag,
} from '@/lib/lab';

interface DraftRow extends TestResultParameter {
  low?: number;
  high?: number;
}
interface DraftTest {
  testId: string;
  testName: string;
  rows: DraftRow[];
  remarks: string;
}

function LabOrdersInner({ session }: RoleViewProps) {
  const searchParams = useSearchParams();
  const openParam = searchParams.get('open');

  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<'all' | TestOrderStatus>('all');
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');

  const [resultsOrder, setResultsOrder] = useState<TestOrder | null>(null);
  const [draft, setDraft] = useState<DraftTest[]>([]);
  const [deleting, setDeleting] = useState<TestOrder | null>(null);

  // Filter, search and page on the server: with only one page in hand, doing it
  // here would search 20 rows and present that as the whole result.
  const debouncedQuery = useDebounced(query);
  const { data: orderPage } = useListTestOrdersPagedQuery({
    q: debouncedQuery.trim() || undefined,
    status: statusFilter === 'all' ? undefined : statusFilter,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });
  const orders = orderPage?.items ?? [];
  const totalOrders = orderPage?.total ?? 0;

  // A new filter means a new result set — page 2 of the old one is meaningless.
  useEffect(() => {
    setPage(1);
  }, [debouncedQuery, statusFilter]);
  const [fetchResults] = useLazyListTestResultsQuery();
  const { data: tests = [] } = useListLabTestsQuery();
  const [updateTestOrder] = useUpdateTestOrderMutation();
  const [upsertTestResult] = useUpsertTestResultMutation();
  const [deleteTestOrder] = useDeleteTestOrderMutation();

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  };

  const testById = useMemo(() => new Map(tests.map((t) => [t.id, t])), [tests]);

  const buildDraft = (order: TestOrder, existingResults: TestResult[]): DraftTest[] => {
    return order.items.map((item) => {
      const existing = existingResults.find((r) => r.testId === item.testId);
      const template = testById.get(item.testId)?.parameters;
      if (existing) {
        return {
          testId: item.testId,
          testName: item.name,
          remarks: existing.remarks,
          rows: existing.parameters.map((p) => {
            const tpl = template?.find((t) => t.name === p.name);
            return { ...p, low: tpl?.low, high: tpl?.high };
          }),
        };
      }
      if (template && template.length) {
        return {
          testId: item.testId,
          testName: item.name,
          remarks: '',
          rows: template.map((t) => ({ name: t.name, value: '', unit: t.unit, referenceRange: t.referenceRange, low: t.low, high: t.high, flag: 'normal' as ResultFlag })),
        };
      }
      return {
        testId: item.testId,
        testName: item.name,
        remarks: '',
        rows: [{ name: 'Result', value: '', unit: '', referenceRange: '', flag: 'normal' as ResultFlag }],
      };
    });
  };

  // Results are fetched for the one order being edited. Holding every result in
  // the hospital in memory was the last unbounded list on this screen, and all
  // the table needed from it — "has a report" — now arrives on the order.
  const openResults = async (order: TestOrder) => {
    const existing = await fetchResults({ orderId: order.id }).unwrap().catch(() => []);
    setDraft(buildDraft(order, existing));
    setResultsOrder(order);
  };

  // Deep-link: /dashboard/lab-orders?open=<id>
  useEffect(() => {
    if (openParam && orders.length && !resultsOrder) {
      const order = orders.find((o) => o.id === openParam);
      if (order) void openResults(order);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openParam, orders]);

  const advance = async (order: TestOrder) => {
    const next = nextLabStatus(order.status);
    if (!next) return;
    setError('');
    try {
      await updateTestOrder({ id: order.id, body: { status: next } }).unwrap();
      flash(`Moved to ${ORDER_STATUS_LABEL[next]}`);
    } catch (err) {
      setError(apiError(err, 'Could not update the order'));
    }
  };

  const setRowValue = (ti: number, ri: number, value: string) => {
    setDraft((prev) =>
      prev.map((t, i) =>
        i !== ti
          ? t
          : { ...t, rows: t.rows.map((r, j) => (j !== ri ? r : { ...r, value, flag: computeFlag(value, r.low, r.high) })) },
      ),
    );
  };
  const setRowFlag = (ti: number, ri: number, flag: ResultFlag) => {
    setDraft((prev) => prev.map((t, i) => (i !== ti ? t : { ...t, rows: t.rows.map((r, j) => (j !== ri ? r : { ...r, flag })) })));
  };
  const setRemarks = (ti: number, remarks: string) => {
    setDraft((prev) => prev.map((t, i) => (i !== ti ? t : { ...t, remarks })));
  };

  const saveResults = async (complete: boolean) => {
    if (!resultsOrder) return;
    setError('');
    try {
      // The server keys results on (order, test) and stamps the id and time, so
      // saving the same draft twice edits one row rather than piling up copies.
      for (const t of draft) {
        await upsertTestResult({
          orderId: resultsOrder.id,
          testId: t.testId,
          testName: t.testName,
          parameters: t.rows.map(({ name, value, unit, referenceRange, flag }) => ({ name, value, unit, referenceRange, flag })),
          remarks: t.remarks,
          reportedBy: session.user.name,
        }).unwrap();
      }
      const newStatus: TestOrderStatus = complete
        ? 'completed'
        : resultsOrder.status === 'ordered' || resultsOrder.status === 'sample_collected'
        ? 'in_progress'
        : resultsOrder.status;
      if (newStatus !== resultsOrder.status) {
        await updateTestOrder({ id: resultsOrder.id, body: { status: newStatus } }).unwrap();
      }
      setResultsOrder(null);
      flash(complete ? 'Results published' : 'Results saved');
    } catch (err) {
      setError(apiError(err, 'Could not save the results'));
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setError('');
    try {
      await deleteTestOrder(deleting.id).unwrap();
      setDeleting(null);
      flash('Order deleted');
    } catch (err) {
      setDeleting(null);
      setError(apiError(err, 'Could not delete the order'));
    }
  };

  const rows = useMemo(() => {
    return orders
      .map((o) => ({
        order: o,
        // Name resolved by the API; no need to hold every patient in memory.
        // Resolved by the API — this screen no longer downloads every
        // patient in the hospital to name twenty rows.
        patient: o.patientName || 'Patient',
        tests: o.items.map((i) => i.name).join(', '),
        hasResults: o.hasResults ?? false,
      }))
      .sort((a, b) => {
        if (a.order.priority !== b.order.priority) return a.order.priority === 'urgent' ? -1 : 1;
        return a.order.orderedAt < b.order.orderedAt ? 1 : -1;
      });
  }, [orders]);

  return (
    <DashboardShell role={session.user.role} userName={session.user.name} title="Test Orders" subtitle="Process orders and publish results">
      <div className="space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search patient, order id or test…"
              className="w-full pl-9 pr-3 py-2 bg-white rounded-lg shadow text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="bg-white rounded-lg shadow px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          >
            <option value="all">All Statuses</option>
            <option value="ordered">Ordered</option>
            <option value="sample_collected">Sample Collected</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="reviewed">Reviewed</option>
          </select>
          <div className="ml-auto">
            <ExportButton
              filename="lab-orders"
              headers={['Order', 'Patient', 'Tests', 'Priority', 'Status']}
              rows={rows.map((r) => [r.order.id, r.patient, r.tests, r.order.priority, r.order.status])}
            />
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b">
            <h3 className="font-semibold text-slate-900">Orders ({totalOrders})</h3>
          </div>
          {rows.length === 0 ? (
            <div className="text-center py-16">
              <ClipboardList className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-600">No orders match your filters.</p>
            </div>
          ) : (
            <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-slate-50">
                    <th className="text-left py-3 px-6 font-semibold text-slate-900">Patient</th>
                    <th className="text-left py-3 px-6 font-semibold text-slate-900">Tests</th>
                    <th className="text-left py-3 px-6 font-semibold text-slate-900">Priority</th>
                    <th className="text-left py-3 px-6 font-semibold text-slate-900">Status</th>
                    <th className="text-right py-3 px-6 font-semibold text-slate-900">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const next = nextLabStatus(r.order.status);
                    return (
                      <tr key={r.order.id} className="border-b hover:bg-slate-50">
                        <td className="py-3 px-6">
                          <p className="font-medium text-slate-900">{r.patient}</p>
                          <p className="text-xs text-slate-400 font-mono">{r.order.id}</p>
                        </td>
                        <td className="py-3 px-6 text-slate-600 max-w-xs">{r.tests}</td>
                        <td className="py-3 px-6">
                          {r.order.priority === 'urgent' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700">
                              <AlertTriangle className="w-3 h-3" /> Urgent
                            </span>
                          ) : (
                            <span className="text-slate-500 text-sm">Routine</span>
                          )}
                        </td>
                        <td className="py-3 px-6">
                          <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${ORDER_STATUS_STYLE[r.order.status]}`}>
                            {ORDER_STATUS_LABEL[r.order.status]}
                          </span>
                        </td>
                        <td className="py-3 px-6 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {next && (
                              <button
                                onClick={() => advance(r.order)}
                                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-cyan-500 to-brand-teal text-white hover:shadow transition whitespace-nowrap"
                              >
                                → {ORDER_STATUS_LABEL[next]}
                              </button>
                            )}
                            <button
                              onClick={() => openResults(r.order)}
                              title={r.hasResults ? 'Edit Results' : 'Enter Results'}
                              aria-label={r.hasResults ? 'Edit Results' : 'Enter Results'}
                              className="p-2 rounded-lg text-slate-500 hover:text-cyan-600 hover:bg-cyan-50 transition"
                            >
                              <ClipboardEdit className="w-4 h-4" />
                            </button>
                            {r.hasResults && (
                              <Link
                                href={`/report/${r.order.id}`}
                                title="View Report"
                                aria-label="View Report"
                                className="p-2 rounded-lg text-slate-500 hover:text-cyan-600 hover:bg-cyan-50 transition"
                              >
                                <FileText className="w-4 h-4" />
                              </Link>
                            )}
                            <button
                              onClick={() => setDeleting(r.order)}
                              title="Delete Order"
                              aria-label="Delete Order"
                              className="p-2 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 transition"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <TablePagination
              page={page}
              pageSize={PAGE_SIZE}
              total={totalOrders}
              onPageChange={setPage}
            />
            </>
          )}
        </div>
      </div>

      {/* Results entry modal */}
      {resultsOrder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-2xl max-w-3xl w-full max-h-[92vh] overflow-y-auto">
            <div className="flex justify-between items-center px-6 py-4 border-b sticky top-0 bg-white">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Enter Results</h3>
                <p className="text-sm text-slate-500">
                  {resultsOrder.patientName || 'Patient'} · <span className="font-mono">{resultsOrder.id}</span>
                </p>
              </div>
              <button onClick={() => setResultsOrder(null)} className="text-slate-500 hover:text-slate-900">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {draft.map((t, ti) => (
                <div key={t.testId} className="border border-slate-200 rounded-lg overflow-hidden">
                  <div className="bg-slate-50 px-4 py-2.5 font-semibold text-slate-800 text-sm">{t.testName}</div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-slate-500 border-b">
                          <th className="text-left py-2 px-4 font-medium">Parameter</th>
                          <th className="text-left py-2 px-4 font-medium">Value</th>
                          <th className="text-left py-2 px-4 font-medium">Unit</th>
                          <th className="text-left py-2 px-4 font-medium">Reference</th>
                          <th className="text-left py-2 px-4 font-medium">Flag</th>
                        </tr>
                      </thead>
                      <tbody>
                        {t.rows.map((r, ri) => (
                          <tr key={ri} className="border-b last:border-0">
                            <td className="py-2 px-4 text-slate-800">{r.name}</td>
                            <td className="py-2 px-4">
                              <input
                                value={r.value}
                                onChange={(e) => setRowValue(ti, ri, e.target.value)}
                                placeholder="—"
                                className="w-24 px-2 py-1 border border-slate-300 rounded focus:outline-none focus:border-cyan-500"
                              />
                            </td>
                            <td className="py-2 px-4 text-slate-500">{r.unit || '—'}</td>
                            <td className="py-2 px-4 text-slate-500 whitespace-nowrap">{r.referenceRange || '—'}</td>
                            <td className="py-2 px-4">
                              <select
                                value={r.flag}
                                onChange={(e) => setRowFlag(ti, ri, e.target.value as ResultFlag)}
                                className={`px-2 py-1 rounded text-xs font-semibold border-0 focus:outline-none ${FLAG_STYLE[r.flag]}`}
                              >
                                {(['normal', 'low', 'high', 'critical'] as ResultFlag[]).map((f) => (
                                  <option key={f} value={f}>{FLAG_LABEL[f]}</option>
                                ))}
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="px-4 py-3 border-t border-slate-100">
                    <input
                      value={t.remarks}
                      onChange={(e) => setRemarks(ti, e.target.value)}
                      placeholder="Remarks / interpretation (optional)"
                      className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-3 px-6 py-4 border-t sticky bottom-0 bg-white">
              <button onClick={() => setResultsOrder(null)} className="flex-1 px-4 py-2 bg-slate-200 text-slate-700 rounded hover:bg-slate-300 transition">
                Cancel
              </button>
              <button onClick={() => saveResults(false)} className="flex-1 px-4 py-2 bg-white border border-cyan-500 text-cyan-700 rounded hover:bg-cyan-50 font-semibold transition">
                Save Draft
              </button>
              <button onClick={() => saveResults(true)} className="flex-1 px-4 py-2 bg-gradient-to-r from-cyan-500 to-brand-teal text-white rounded hover:shadow-lg font-semibold transition">
                Save &amp; Publish
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleting && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-2xl max-w-md w-full p-6">
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <div className="min-w-0">
                <h3 className="text-lg font-bold text-slate-900">Delete Order</h3>
                <p className="text-slate-600 mt-1 text-sm">
                  Delete order <span className="font-mono">{deleting.id}</span> and its results? This cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setDeleting(null)} className="flex-1 px-4 py-2 bg-slate-200 text-slate-700 rounded hover:bg-slate-300 transition">
                Cancel
              </button>
              <button onClick={confirmDelete} className="flex-1 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 font-semibold transition">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white text-sm px-4 py-2 rounded-lg shadow-lg">
          {toast}
        </div>
      )}
    </DashboardShell>
  );
}

export function LabOrders({ session }: RoleViewProps) {
  return (
    <Suspense fallback={null}>
      <LabOrdersInner session={session} />
    </Suspense>
  );
}
