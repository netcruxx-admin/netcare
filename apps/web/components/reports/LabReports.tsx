'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, FileBarChart, AlertTriangle } from 'lucide-react';
import type { TestResult } from '@/lib/types';
import {
  useListPatientsQuery,
  useListTestOrdersQuery,
  useListTestResultsQuery,
} from '@/store/api';
import { DashboardShell } from '@/components/DashboardShell';
import type { RoleViewProps } from '@/components/RoleView';
import { ExportButton } from '@/components/ExportButton';
import { ORDER_STATUS_LABEL, ORDER_STATUS_STYLE, isAbnormal } from '@/lib/lab';

export function LabReports({ session }: RoleViewProps) {
  const [query, setQuery] = useState('');

  const { data: orders = [] } = useListTestOrdersQuery();
  const { data: results = [] } = useListTestResultsQuery();
  const { data: patients = [] } = useListPatientsQuery();

  const rows = useMemo(() => {
    const patientName = (id: string) =>
      patients.find((p) => p.id === id)?.user?.name ?? 'Patient';
    const resultsByOrder = new Map<string, TestResult[]>();
    results.forEach((r) => {
      const list = resultsByOrder.get(r.orderId) ?? [];
      list.push(r);
      resultsByOrder.set(r.orderId, list);
    });

    const q = query.trim().toLowerCase();
    return orders
      .filter((o) => o.status === 'completed' || o.status === 'reviewed')
      .map((o) => {
        const res = resultsByOrder.get(o.id) ?? [];
        return {
          order: o,
          patient: patientName(o.patientId),
          tests: o.items.map((i) => i.name).join(', '),
          abnormal: res.some((r) => r.parameters.some((p) => isAbnormal(p.flag))),
          reportedBy: res[0]?.reportedBy ?? '—',
          reportedAt: res[0]?.reportedAt?.split('T')[0] ?? '—',
        };
      })
      .filter((r) => !q || r.patient.toLowerCase().includes(q) || r.tests.toLowerCase().includes(q))
      .sort((a, b) => (a.reportedAt < b.reportedAt ? 1 : -1));
  }, [orders, results, patients, query]);

  return (
    <DashboardShell role={session.user.role} userName={session.user.name} title="Reports" subtitle="Published lab reports">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search patient or test…"
              className="w-full pl-9 pr-3 py-2 bg-white rounded-lg shadow text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>
          <ExportButton
            filename="published-reports"
            headers={['Order', 'Patient', 'Tests', 'Reported', 'Reported By', 'Status', 'Abnormal']}
            rows={rows.map((r) => [r.order.id, r.patient, r.tests, r.reportedAt, r.reportedBy, r.order.status, r.abnormal ? 'Yes' : 'No'])}
          />
        </div>

        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b">
            <h3 className="font-semibold text-slate-900">Published Reports ({rows.length})</h3>
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
            </div>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
