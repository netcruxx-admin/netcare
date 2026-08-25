'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { FileBarChart, FlaskConical, AlertTriangle, RefreshCw } from 'lucide-react';
import type { TestResult } from '@/lib/types';
import {
  useListDoctorsQuery,
  useListTestOrdersQuery,
  useListTestResultsQuery,
} from '@/store/api';
import { fmtDate } from '@/lib/date';
import { DashboardShell } from '@/components/DashboardShell';
import type { RoleViewProps } from '@/components/RoleView';
import { ORDER_STATUS_LABEL, ORDER_STATUS_STYLE, isAbnormal } from '@/lib/lab';
import { Spinner } from '@/components/ui/spinner';

export function PatientReports({ session }: RoleViewProps) {
  // All three are already narrowed to this patient by the API's "own" scope.
  const { data: orders = [], refetch: refetchOrders, isLoading: loadingOrders, isFetching: fetchingOrders } = useListTestOrdersQuery();
  const { data: results = [], refetch: refetchResults, isLoading: loadingResults } = useListTestResultsQuery();
  const { data: doctors = [], isLoading: loadingDoctors } = useListDoctorsQuery();

  const refresh = () => { refetchOrders(); refetchResults(); };

  const rows = useMemo(() => {
    const doctorName = (id: string) => {
      const name = doctors.find((d) => d.id === id)?.user?.name;
      return name ? `Dr. ${name}` : '—';
    };
    const resultsByOrder = new Map<string, TestResult[]>();
    results.forEach((r) => {
      const list = resultsByOrder.get(r.orderId) ?? [];
      list.push(r);
      resultsByOrder.set(r.orderId, list);
    });

    return orders
      .map((o) => {
        const res = resultsByOrder.get(o.id) ?? [];
        return {
          order: o,
          doctor: doctorName(o.doctorId),
          tests: o.items.map((i) => i.name),
          ready: o.status === 'completed' || o.status === 'reviewed',
          abnormal: res.some((r) => r.parameters.some((p) => isAbnormal(p.flag))),
          date: fmtDate(o.orderedAt),
        };
      })
      .sort((a, b) => (a.order.orderedAt < b.order.orderedAt ? 1 : -1));
  }, [orders, results, doctors]);

  return (
    <DashboardShell role={session.user.role} userName={session.user.name} title="Test Reports" subtitle="Your lab tests and results">
      <div className="space-y-4">
        {rows.some((r) => !r.ready) && (
          <div className="flex items-center justify-end">
            <button
              onClick={refresh}
              disabled={fetchingOrders}
              className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-cyan-600 disabled:opacity-50 transition"
            >
              {fetchingOrders ? (
                <Spinner size="sm" label="Checking…" />
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" /> Check for updates
                </>
              )}
            </button>
          </div>
        )}
        {loadingOrders || loadingResults || loadingDoctors ? (
          <Spinner variant="block" />
        ) : rows.length === 0 ? (
          <div className="bg-white rounded-lg shadow text-center py-16">
            <FileBarChart className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-600">No lab tests ordered yet.</p>
          </div>
        ) : (
          rows.map((r) => (
            <div key={r.order.id} className="bg-white rounded-lg shadow p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${ORDER_STATUS_STYLE[r.order.status]}`}>
                      {ORDER_STATUS_LABEL[r.order.status]}
                    </span>
                    {r.abnormal && r.ready && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
                        <AlertTriangle className="w-3 h-3" /> Review needed
                      </span>
                    )}
                    <span className="text-xs text-slate-400">Ordered {r.date} · {r.doctor}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {r.tests.map((t) => (
                      <span key={t} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-sm">
                        <FlaskConical className="w-3.5 h-3.5 text-cyan-600" /> {t}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="shrink-0">
                  {r.ready ? (
                    <Link href={`/report/${r.order.id}`} className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-500 to-brand-teal text-white rounded-lg text-sm font-semibold hover:shadow-lg transition">
                      View Report
                    </Link>
                  ) : (
                    <span className="text-sm text-slate-400">Report pending</span>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </DashboardShell>
  );
}
