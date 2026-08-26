'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import {
  Pill, PackageCheck, AlertTriangle, PackageX, ArrowRight, Loader2, CheckCircle2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  useListLowStockQuery,
  useListMedicationOrdersQuery,
} from '@/store/api';
import { DashboardShell } from '@/components/DashboardShell';
import type { RoleViewProps } from '@/components/RoleView';
import { fmtDate } from '@/lib/date';

export function PharmacistDashboard({ session }: RoleViewProps) {
  const { data: orders = [], isLoading } = useListMedicationOrdersQuery();
  // `inventory.read` covers this; a pharmacist always holds it.
  const { data: lowStock = [] } = useListLowStockQuery();

  const model = useMemo(() => {
    const pending = orders.filter((o) => o.status === 'pending');
    const dispensed = orders.filter((o) => o.status === 'dispensed');
    return {
      pending,
      kpis: {
        toDispense: pending.length,
        dispensed: dispensed.length,
        lowStock: lowStock.length,
        outOfStock: lowStock.filter((m) => (m.stock ?? 0) <= 0).length,
      },
      // Oldest first: a queue is worked from the front, and an order that has
      // been waiting longest is the one a patient is standing at the counter
      // for.
      queue: [...pending].sort((a, b) => (a.orderedAt < b.orderedAt ? -1 : 1)),
    };
  }, [orders, lowStock]);


  const cards: { label: string; value: number; icon: LucideIcon; tint: string; href: string }[] = [
    { label: 'To Dispense', value: model.kpis.toDispense, icon: Pill, tint: 'text-slate-600 bg-slate-100', href: '/dashboard/medication-orders' },
    { label: 'Dispensed', value: model.kpis.dispensed, icon: PackageCheck, tint: 'text-blue-600 bg-blue-50', href: '/dashboard/medication-orders' },
    { label: 'Low Stock', value: model.kpis.lowStock, icon: AlertTriangle, tint: 'text-amber-600 bg-amber-50', href: '/dashboard/inventory' },
    { label: 'Out of Stock', value: model.kpis.outOfStock, icon: PackageX, tint: 'text-red-600 bg-red-50', href: '/dashboard/inventory' },
  ];

  return (
    <DashboardShell role={session.user.role} userName={session.user.name} title="Pharmacy" subtitle="Dispensing and stock overview" loading={isLoading}>
      <div className="space-y-6">
        <div className="bg-gradient-to-r from-cyan-500 to-brand-teal text-white rounded-lg p-6 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold">Welcome, {session.user.name}</h2>
            <p className="text-cyan-100 mt-1">
              {model.kpis.toDispense === 0
                ? 'Nothing waiting to be dispensed.'
                : `${model.kpis.toDispense} order(s) waiting to be dispensed.`}
            </p>
          </div>
          <Link
            href="/dashboard/medication-orders"
            className="hidden sm:inline-flex items-center gap-2 bg-white/15 hover:bg-white/25 px-4 py-2 rounded-lg font-semibold transition"
          >
            Open dispense queue <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {cards.map((c) => {
            const Icon = c.icon;
            return (
              <Link key={c.label} href={c.href} className="bg-white rounded-lg shadow p-4 flex items-center gap-3 hover:shadow-md transition">
                <div className={`w-11 h-11 rounded-lg flex items-center justify-center shrink-0 ${c.tint}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-2xl font-bold text-slate-900 leading-tight">{c.value}</p>
                  <p className="text-xs text-slate-500">{c.label}</p>
                </div>
              </Link>
            );
          })}
        </div>

        {/* Stock that will stop a dispense, above the queue: finding out at the
            counter is worse than knowing before the patient arrives. */}
        {model.kpis.lowStock > 0 && (
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                Needs restocking ({model.kpis.lowStock})
              </h3>
              <Link href="/dashboard/inventory" className="text-cyan-600 hover:text-cyan-700 text-sm font-semibold">
                Manage inventory
              </Link>
            </div>
            <ul className="divide-y divide-slate-100">
              {lowStock.slice(0, 5).map((m) => (
                <li key={m.id} className="px-6 py-3 flex items-center justify-between gap-4 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900 truncate">{m.name}</p>
                    <p className="text-xs text-slate-500">
                      {[m.form, m.strength].filter(Boolean).join(' · ') || '—'}
                    </p>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-full text-xs font-semibold shrink-0 ${
                      (m.stock ?? 0) <= 0
                        ? 'bg-red-100 text-red-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {(m.stock ?? 0) <= 0 ? 'Out of stock' : `${m.stock} left`}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">Dispense Queue ({model.queue.length})</h3>
            <Link href="/dashboard/medication-orders" className="text-cyan-600 hover:text-cyan-700 text-sm font-semibold">
              See all orders
            </Link>
          </div>
          {model.queue.length === 0 ? (
            <div className="text-center py-14">
              <CheckCircle2 className="w-14 h-14 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-600">All caught up — nothing to dispense.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-slate-50">
                    <th className="text-left py-3 px-6 font-semibold text-slate-900">Patient</th>
                    <th className="text-left py-3 px-6 font-semibold text-slate-900">Medicine</th>
                    <th className="text-right py-3 px-6 font-semibold text-slate-900">Qty</th>
                    <th className="text-left py-3 px-6 font-semibold text-slate-900">Dosage</th>
                    <th className="text-left py-3 px-6 font-semibold text-slate-900">Ordered</th>
                    <th className="text-right py-3 px-6 font-semibold text-slate-900">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {model.queue.slice(0, 8).map((o) => (
                    <tr key={o.id} className="border-b hover:bg-slate-50">
                      <td className="py-3 px-6 font-medium text-slate-900">
                        {o.patientName ?? o.patientId}
                      </td>
                      <td className="py-3 px-6 text-slate-700">{o.medicineName}</td>
                      <td className="py-3 px-6 text-right font-medium text-slate-900 tabular-nums">
                        {o.quantity}
                      </td>
                      <td className="py-3 px-6 text-slate-600">
                        {[o.dosage, o.frequency].filter(Boolean).join(' · ')}
                      </td>
                      <td className="py-3 px-6 text-slate-500 whitespace-nowrap">
                        {fmtDate(o.orderedAt)}
                      </td>
                      <td className="py-3 px-6 text-right">
                        <Link
                          href="/dashboard/medication-orders"
                          className="text-cyan-600 hover:text-cyan-700 font-semibold text-sm"
                        >
                          Dispense
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
