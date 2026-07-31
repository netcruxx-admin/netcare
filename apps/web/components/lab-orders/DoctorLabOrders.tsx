'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Search, ClipboardList, AlertTriangle } from 'lucide-react';
import { dbOperations, TestOrder, TestResult, Patient, User } from '@/lib/db';
import { DashboardShell } from '@/components/DashboardShell';
import type { RoleViewProps } from '@/components/RoleView';
import { ExportButton } from '@/components/ExportButton';
import { ORDER_STATUS_LABEL, ORDER_STATUS_STYLE, isAbnormal } from '@/lib/lab';

interface RawData {
  orders: TestOrder[];
  results: TestResult[];
  patients: Patient[];
  users: User[];
}

export function DoctorLabOrders({ session }: RoleViewProps) {
  const router = useRouter();
  const [raw, setRaw] = useState<RawData | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [toast, setToast] = useState('');

  const load = (userId: string) => {
    const doctor = dbOperations.getAllDoctors().find((d) => d.userId === userId) ?? null;
    setRaw({
      orders: doctor ? dbOperations.getTestOrdersByDoctorId(doctor.id) : [],
      results: dbOperations.getAllTestResults(),
      patients: dbOperations.getAllPatients(),
      users: dbOperations.getAllUsers(),
    });
  };

  useEffect(() => {
    const s = session;
    load(s.user.id);
  }, [session]);

  const markReviewed = (id: string) => {
    dbOperations.updateTestOrder(id, { status: 'reviewed' });
    if (session) load(session.user.id);
    setToast('Report reviewed');
    setTimeout(() => setToast(''), 2500);
  };

  const rows = useMemo(() => {
    if (!raw) return [];
    const userById = new Map(raw.users.map((u) => [u.id, u]));
    const patientById = new Map(raw.patients.map((p) => [p.id, p]));
    const patientName = (id: string) => {
      const p = patientById.get(id);
      const u = p ? userById.get(p.userId) : null;
      return u?.name ?? 'Patient';
    };
    const resultsByOrder = new Map<string, TestResult[]>();
    raw.results.forEach((r) => {
      const list = resultsByOrder.get(r.orderId) ?? [];
      list.push(r);
      resultsByOrder.set(r.orderId, list);
    });

    const q = query.trim().toLowerCase();
    return raw.orders
      .map((o) => {
        const res = resultsByOrder.get(o.id) ?? [];
        const abnormal = res.some((r) => r.parameters.some((p) => isAbnormal(p.flag)));
        return {
          order: o,
          patient: patientName(o.patientId),
          tests: o.items.map((i) => i.name).join(', '),
          hasResults: res.length > 0,
          abnormal,
        };
      })
      .filter((r) => statusFilter === 'all' || r.order.status === statusFilter)
      .filter((r) => !q || r.patient.toLowerCase().includes(q) || r.tests.toLowerCase().includes(q))
      .sort((a, b) => (a.order.orderedAt < b.order.orderedAt ? 1 : -1));
  }, [raw, query, statusFilter]);

  return (
    <DashboardShell role={session.user.role} userName={session.user.name} title="Lab Orders" subtitle="Tests you have ordered and their reports">
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
            rows={rows.map((r) => [r.order.id, r.patient, r.tests, r.order.status, r.abnormal ? 'Yes' : 'No'])}
          />
        </div>

        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b">
            <h3 className="font-semibold text-slate-900">Orders ({rows.length})</h3>
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
                        {r.hasResults && (
                          <Link href={`/report/${r.order.id}`} className="text-cyan-600 hover:text-cyan-700 font-semibold text-sm mr-4">
                            View Report
                          </Link>
                        )}
                        {r.order.status === 'completed' && (
                          <button onClick={() => markReviewed(r.order.id)} className="text-purple-600 hover:text-purple-700 font-semibold text-sm">
                            Mark Reviewed
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white text-sm px-4 py-2 rounded-lg shadow-lg">
          {toast}
        </div>
      )}
    </DashboardShell>
  );
}
