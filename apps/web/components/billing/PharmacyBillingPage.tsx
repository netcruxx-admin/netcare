'use client';

import { useState } from 'react';
import {
  Banknote,
  CreditCard,
  IndianRupee,
  Loader2,
  Printer,
  QrCode,
  Receipt,
  ReceiptText,
} from 'lucide-react';
import { DashboardShell } from '@/components/DashboardShell';
import type { RoleViewProps } from '@/components/RoleView';
import { useGetPharmacyBillingSummaryQuery } from '@/store/api';
import type { PharmacyBillingRow } from '@/lib/types';
import { openInvoicePrint } from '@/components/payments/printInvoice';
import { fmtCurrency, fmtTime, methodBadgeClass, methodLabel, todayIso } from './billingFormat';
import { DateRangeFilter, type DateRange } from '@/components/DateRangeFilter';
import { Table, TableHeader, TableBody, TableFooter, TableRow, TableHead, TableCell } from '@/components/ui/table';

// ── KPI card ─────────────────────────────────────────────────────────────────

interface KpiCardProps {
  label: string;
  amount: number;
  count?: number;
  icon: React.ReactNode;
  tint: string;
}

function KpiCard({ label, amount, count, icon, tint }: KpiCardProps) {
  return (
    <div className={`bg-white rounded-xl shadow p-5 flex items-start gap-4`}>
      <div className={`w-11 h-11 rounded-lg flex items-center justify-center shrink-0 ${tint}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xl font-bold text-slate-900 leading-tight tabular-nums">
          {fmtCurrency(amount)}
        </p>
        <p className="text-xs text-slate-500 mt-0.5">{label}</p>
        {count !== undefined && (
          <p className="text-xs text-slate-400">{count} bill{count !== 1 ? 's' : ''}</p>
        )}
      </div>
    </div>
  );
}

// ── row ──────────────────────────────────────────────────────────────────────

function BillingRow({ row, onPrint }: { row: PharmacyBillingRow; onPrint: (id: string) => void }) {
  return (
    <TableRow className="border-b hover:bg-slate-50 transition">
      <TableCell className="py-3 px-4 text-xs font-mono text-slate-500">
        {row.invoiceNumber}
      </TableCell>
      <TableCell className="py-3 px-4 text-sm text-slate-500">
        {fmtTime(row.createdAt)}
      </TableCell>
      <TableCell className="py-3 px-4 whitespace-normal">
        <p className="text-sm font-medium text-slate-900">{row.patientName || '—'}</p>
        {row.patientPhone && (
          <p className="text-xs text-slate-400">{row.patientPhone}</p>
        )}
      </TableCell>
      <TableCell className="py-3 px-4 whitespace-normal">
        <p className="text-sm text-slate-800">{row.medicineName || '—'}</p>
        {row.dosage && <p className="text-xs text-slate-400">{row.dosage}</p>}
      </TableCell>
      <TableCell className="py-3 px-4 text-right text-sm tabular-nums text-slate-700 whitespace-normal">
        {row.quantity}
      </TableCell>
      <TableCell className="py-3 px-4 text-right text-sm tabular-nums text-slate-700 whitespace-normal">
        {fmtCurrency(row.unitPrice)}
      </TableCell>
      <TableCell className="py-3 px-4 text-right text-sm font-semibold tabular-nums text-slate-900 whitespace-normal">
        {fmtCurrency(row.amount)}
      </TableCell>
      <TableCell className="py-3 px-4 whitespace-normal">
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${methodBadgeClass(row.paymentMethod)}`}>
          {methodLabel(row.paymentMethod)}
        </span>
      </TableCell>
      <TableCell className="py-3 px-4 text-right whitespace-normal">
        <button
          onClick={() => onPrint(row.paymentId)}
          title="Print invoice"
          className="p-1.5 rounded text-slate-400 hover:text-cyan-600 hover:bg-cyan-50 transition"
        >
          <Printer className="w-4 h-4" />
        </button>
      </TableCell>
    </TableRow>
  );
}

// ── main component ────────────────────────────────────────────────────────────

/** The pharmacy day-report on its own, with no page chrome.
 *
 *  Split out from the page component so the Billing screen can show it beside
 *  the consultation report under a tab, rather than the two living at separate
 *  URLs with duplicate date pickers. */
export function PharmacyBillingContent() {
  const [dateRange, setDateRange] = useState<DateRange>({ from: todayIso(), to: todayIso() });

  const { data: summary, isLoading, isFetching } = useGetPharmacyBillingSummaryQuery(
    { dateFrom: dateRange.from || undefined, dateTo: dateRange.to || undefined },
    { refetchOnMountOrArgChange: true },
  );

  const isToday = dateRange.from === todayIso() && dateRange.to === todayIso();
  const rangeLabel = dateRange.from === dateRange.to ? dateRange.from : `${dateRange.from} to ${dateRange.to}`;

  if (isLoading) {
    return (
      <div className="py-16 flex justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
      <div className="space-y-6">

        {/* date selector + refresh indicator */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <DateRangeFilter value={dateRange} onChange={setDateRange} defaultDate={todayIso()} max={todayIso()} />
            {isToday && (
              <span className="text-xs font-medium bg-cyan-100 text-cyan-700 px-2 py-0.5 rounded-full">
                Today
              </span>
            )}
          </div>
          {isFetching && (
            <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
          )}
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            label="Total Collected"
            amount={summary?.total ?? 0}
            count={summary?.billCount}
            icon={<IndianRupee className="w-5 h-5" />}
            tint="text-cyan-600 bg-cyan-50"
          />
          <KpiCard
            label="Cash"
            amount={summary?.cashTotal ?? 0}
            icon={<Banknote className="w-5 h-5" />}
            tint="text-green-600 bg-green-50"
          />
          <KpiCard
            label="UPI / QR"
            amount={summary?.upiTotal ?? 0}
            icon={<QrCode className="w-5 h-5" />}
            tint="text-violet-600 bg-violet-50"
          />
          <KpiCard
            label="Card"
            amount={summary?.cardTotal ?? 0}
            icon={<CreditCard className="w-5 h-5" />}
            tint="text-blue-600 bg-blue-50"
          />
        </div>

        {/* transactions table */}
        <div className="bg-white rounded-xl shadow">
          <div className="px-6 py-4 border-b flex items-center gap-2">
            <ReceiptText className="w-4 h-4 text-slate-500" />
            <h3 className="font-semibold text-slate-900">
              Bills — {rangeLabel}
              {summary && summary.billCount > 0 && (
                <span className="ml-2 text-sm font-normal text-slate-500">
                  ({summary.billCount} transaction{summary.billCount !== 1 ? 's' : ''})
                </span>
              )}
            </h3>
          </div>

          {!summary || summary.rows.length === 0 ? (
            <div className="text-center py-16">
              <Receipt className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 text-sm">No pharmacy bills for this period.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-b bg-slate-50 text-xs font-semibold text-slate-600 uppercase tracking-wide">
                    <TableHead className="py-3 px-4">Invoice</TableHead>
                    <TableHead className="py-3 px-4">Time</TableHead>
                    <TableHead className="py-3 px-4">Patient</TableHead>
                    <TableHead className="py-3 px-4">Medicine</TableHead>
                    <TableHead className="py-3 px-4 text-right">Qty</TableHead>
                    <TableHead className="py-3 px-4 text-right">Unit Price</TableHead>
                    <TableHead className="py-3 px-4 text-right">Amount</TableHead>
                    <TableHead className="py-3 px-4">Method</TableHead>
                    <TableHead className="py-3 px-4 text-right">Print</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.rows.map((row) => (
                    <BillingRow key={row.paymentId} row={row} onPrint={openInvoicePrint} />
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow className="border-t bg-slate-50">
                    <TableCell colSpan={6} className="py-3 px-4 text-sm font-semibold text-slate-700 text-right">
                      Total
                    </TableCell>
                    <TableCell className="py-3 px-4 text-right text-sm font-bold text-slate-900 tabular-nums">
                      {fmtCurrency(summary.total)}
                    </TableCell>
                    <TableCell colSpan={2} />
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          )}
        </div>
      </div>
  );
}

/** The pharmacist's standalone screen, kept for direct use. */
export function PharmacyBillingPage({ session }: RoleViewProps) {
  return (
    <DashboardShell
      role={session.user.role}
      userName={session.user.name}
      title="Pharmacy Billing"
      subtitle="Daily collections and billing summary"
    >
      <PharmacyBillingContent />
    </DashboardShell>
  );
}
