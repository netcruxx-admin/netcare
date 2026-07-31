'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { Inbox, FlaskConical, CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useListPatientsQuery, useListTestOrdersQuery } from '@/store/api';
import { DashboardShell } from '@/components/DashboardShell';
import type { RoleViewProps } from '@/components/RoleView';
import { ORDER_STATUS_LABEL, ORDER_STATUS_STYLE } from '@/lib/lab';

export function LabDashboard({ session }: RoleViewProps) {
  const { data: orders = [], isLoading } = useListTestOrdersQuery();
  const { data: patients = [] } = useListPatientsQuery();

  const model = useMemo(() => {
    const patientName = (id: string) =>
      patients.find((p) => p.id === id)?.user?.name ?? 'Patient';

    const kpis = {
      newOrders: orders.filter((o) => o.status === 'ordered').length,
      inLab: orders.filter((o) => o.status === 'sample_collected' || o.status === 'in_progress').length,
      completed: orders.filter((o) => o.status === 'completed' || o.status === 'reviewed').length,
      urgent: orders.filter((o) => o.priority === 'urgent' && o.status !== 'reviewed').length,
    };

    // Work queue = anything the lab still needs to act on.
    const queue = orders
      .filter((o) => o.status !== 'reviewed' && o.status !== 'completed')
      .map((o) => ({ ...o, patient: patientName(o.patientId), tests: o.items.length }))
      .sort((a, b) => {
        if (a.priority !== b.priority) return a.priority === 'urgent' ? -1 : 1;
        return a.orderedAt < b.orderedAt ? -1 : 1;
      });

    return { kpis, queue };
  }, [orders, patients]);

  if (isLoading) return null;

  const cards: { label: string; value: number; icon: LucideIcon; tint: string }[] = [
    { label: 'New Orders', value: model.kpis.newOrders, icon: Inbox, tint: 'text-slate-600 bg-slate-100' },
    { label: 'In the Lab', value: model.kpis.inLab, icon: FlaskConical, tint: 'text-blue-600 bg-blue-50' },
    { label: 'Completed', value: model.kpis.completed, icon: CheckCircle2, tint: 'text-green-600 bg-green-50' },
    { label: 'Urgent Pending', value: model.kpis.urgent, icon: AlertTriangle, tint: 'text-red-600 bg-red-50' },
  ];

  return (
    <DashboardShell role={session.user.role} userName={session.user.name} title="Laboratory" subtitle="Test processing overview">
      <div className="space-y-6">
        <div className="bg-gradient-to-r from-cyan-500 to-teal-600 text-white rounded-lg p-6 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold">Welcome, {session.user.name}</h2>
            <p className="text-cyan-100 mt-1">You have {model.kpis.newOrders + model.kpis.inLab} order(s) awaiting action.</p>
          </div>
          <Link href="/dashboard/lab-orders" className="hidden sm:inline-flex items-center gap-2 bg-white/15 hover:bg-white/25 px-4 py-2 rounded-lg font-semibold transition">
            Open work queue <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {cards.map((c) => {
            const Icon = c.icon;
            return (
              <div key={c.label} className="bg-white rounded-lg shadow p-4 flex items-center gap-3">
                <div className={`w-11 h-11 rounded-lg flex items-center justify-center shrink-0 ${c.tint}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-2xl font-bold text-slate-900 leading-tight">{c.value}</p>
                  <p className="text-xs text-slate-500">{c.label}</p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">Work Queue ({model.queue.length})</h3>
            <Link href="/dashboard/lab-orders" className="text-cyan-600 hover:text-cyan-700 text-sm font-semibold">See all orders</Link>
          </div>
          {model.queue.length === 0 ? (
            <div className="text-center py-14">
              <CheckCircle2 className="w-14 h-14 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-600">All caught up — no pending orders.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-slate-50">
                    <th className="text-left py-3 px-6 font-semibold text-slate-900">Order</th>
                    <th className="text-left py-3 px-6 font-semibold text-slate-900">Patient</th>
                    <th className="text-left py-3 px-6 font-semibold text-slate-900">Tests</th>
                    <th className="text-left py-3 px-6 font-semibold text-slate-900">Priority</th>
                    <th className="text-left py-3 px-6 font-semibold text-slate-900">Status</th>
                    <th className="text-right py-3 px-6 font-semibold text-slate-900">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {model.queue.slice(0, 8).map((o) => (
                    <tr key={o.id} className="border-b hover:bg-slate-50">
                      <td className="py-3 px-6 font-mono text-xs text-slate-500">{o.id}</td>
                      <td className="py-3 px-6 font-medium text-slate-900">{o.patient}</td>
                      <td className="py-3 px-6 text-slate-600">{o.tests}</td>
                      <td className="py-3 px-6">
                        {o.priority === 'urgent' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700">
                            <AlertTriangle className="w-3 h-3" /> Urgent
                          </span>
                        ) : (
                          <span className="text-slate-500 text-sm">Routine</span>
                        )}
                      </td>
                      <td className="py-3 px-6">
                        <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${ORDER_STATUS_STYLE[o.status]}`}>
                          {ORDER_STATUS_LABEL[o.status]}
                        </span>
                      </td>
                      <td className="py-3 px-6 text-right">
                        <Link href={`/dashboard/lab-orders?open=${o.id}`} className="text-cyan-600 hover:text-cyan-700 font-semibold text-sm">
                          Process
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
