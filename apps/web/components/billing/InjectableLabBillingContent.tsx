'use client';

import { useState } from 'react';
import {
  Banknote,
  Clock,
  CreditCard,
  IndianRupee,
  Loader2,
  Printer,
  QrCode,
  Receipt,
  ReceiptText,
  Syringe,
  TestTube,
} from 'lucide-react';
import { useGetInjectableLabBillingSummaryQuery } from '@/store/api';
import type { InjectableLabBillingRow } from '@/lib/types';
import { openInvoicePrint } from '@/components/payments/printInvoice';
import { CollectPaymentModal } from '@/components/payments/CollectPaymentModal';
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

// ── category badge ───────────────────────────────────────────────────────────

const CATEGORY_STYLE: Record<InjectableLabBillingRow['category'], string> = {
  injectable: 'bg-amber-100 text-amber-700',
  lab: 'bg-cyan-100 text-cyan-700',
};

const CATEGORY_LABEL: Record<InjectableLabBillingRow['category'], string> = {
  injectable: 'Injectable',
  lab: 'Lab',
};

const CATEGORY_ICON: Record<InjectableLabBillingRow['category'], React.ReactNode> = {
  injectable: <Syringe className="w-3 h-3" />,
  lab: <TestTube className="w-3 h-3" />,
};

// ── row ──────────────────────────────────────────────────────────────────────

function Row({
  row, onPrint, onCollect, canCollect,
}: {
  row: InjectableLabBillingRow;
  onPrint: (id: string) => void;
  onCollect: (row: InjectableLabBillingRow) => void;
  canCollect: boolean;
}) {
  const collected = row.status === 'completed';

  return (
    <TableRow className="border-b hover:bg-slate-50 transition">
      <TableCell className="py-3 px-4 text-xs font-mono text-slate-500">
        {row.invoiceNumber}
      </TableCell>
      <TableCell className="py-3 px-4 text-sm text-slate-500">
        {fmtTime(row.createdAt)}
      </TableCell>
      <TableCell className="py-3 px-4 whitespace-normal">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${CATEGORY_STYLE[row.category]}`}>
          {CATEGORY_ICON[row.category]}
          {CATEGORY_LABEL[row.category]}
        </span>
      </TableCell>
      <TableCell className="py-3 px-4 whitespace-normal">
        <p className="text-sm font-medium text-slate-900">{row.patientName || '—'}</p>
        {row.patientPhone && (
          <p className="text-xs text-slate-400">{row.patientPhone}</p>
        )}
      </TableCell>
      <TableCell className="py-3 px-4 text-sm text-slate-800 whitespace-normal">{row.description || '—'}</TableCell>
      <TableCell className="py-3 px-4 text-right text-sm tabular-nums text-slate-700 whitespace-normal">
        {row.quantity}
      </TableCell>
      <TableCell className="py-3 px-4 text-right text-sm font-semibold tabular-nums text-slate-900 whitespace-normal">
        {fmtCurrency(row.amount)}
      </TableCell>
      <TableCell className="py-3 px-4 whitespace-normal">
        {collected ? (
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${methodBadgeClass(row.paymentMethod)}`}>
            {methodLabel(row.paymentMethod)}
          </span>
        ) : (
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
            Pending
          </span>
        )}
      </TableCell>
      <TableCell className="py-3 px-4 whitespace-normal">
        <div className="flex items-center justify-end gap-2">
          {!collected && canCollect && (
            <button
              onClick={() => onCollect(row)}
              className="text-xs font-medium text-green-700 bg-green-50 border border-green-200 px-2.5 py-1 rounded-lg hover:bg-green-100 transition"
            >
              Mark Paid
            </button>
          )}
          <button
            onClick={() => onPrint(row.paymentId)}
            title="Print invoice"
            className="p-1.5 rounded text-slate-400 hover:text-cyan-600 hover:bg-cyan-50 transition"
          >
            <Printer className="w-4 h-4" />
          </button>
        </div>
      </TableCell>
    </TableRow>
  );
}

// ── main component ────────────────────────────────────────────────────────────

/** The combined injectables + lab tests day-report.
 *
 *  Both bill themselves the moment a nurse administers a shot or lab staff
 *  complete a test order — a `pending` Payment appears here with no method
 *  yet, exactly like a consultation. Nurses and lab staff never collect
 *  money; the front desk does that from this tab with the same `payments.manage`
 *  gate the consultation tab uses. Its printed bill is always the plain
 *  (no-letterhead) template — see `forcePlain` on the invoice print route —
 *  so it needs no print plumbing of its own here. */
export function InjectableLabBillingContent({ canCollect = false }: { canCollect?: boolean } = {}) {
  const [dateRange, setDateRange] = useState<DateRange>({ from: todayIso(), to: todayIso() });
  const [collecting, setCollecting] = useState<InjectableLabBillingRow | null>(null);

  const { data: summary, isLoading, isFetching } = useGetInjectableLabBillingSummaryQuery(
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
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
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
          {/* Billed but not collected. The number the desk works down before close
              of day, so it sits with the takings rather than inside the table. */}
          <KpiCard
            label="Pending Collection"
            amount={summary?.pendingTotal ?? 0}
            icon={<Clock className="w-5 h-5" />}
            tint="text-amber-600 bg-amber-50"
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
              <p className="text-slate-500 text-sm">No injectable or lab bills for this period.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-b bg-slate-50 text-xs font-semibold text-slate-600 uppercase tracking-wide">
                    <TableHead className="py-3 px-4">Invoice</TableHead>
                    <TableHead className="py-3 px-4">Time</TableHead>
                    <TableHead className="py-3 px-4">Category</TableHead>
                    <TableHead className="py-3 px-4">Patient</TableHead>
                    <TableHead className="py-3 px-4">Description</TableHead>
                    <TableHead className="py-3 px-4 text-right">Qty</TableHead>
                    <TableHead className="py-3 px-4 text-right">Amount</TableHead>
                    <TableHead className="py-3 px-4">Status</TableHead>
                    <TableHead className="py-3 px-4 text-right">Print</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.rows.map((row) => (
                    <Row
                      key={row.paymentId}
                      row={row}
                      onPrint={openInvoicePrint}
                      onCollect={setCollecting}
                      canCollect={canCollect}
                    />
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow className="border-t bg-slate-50">
                    <TableCell colSpan={6} className="py-3 px-4 text-sm font-semibold text-slate-700 text-right">
                      Collected
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

        <CollectPaymentModal
          open={collecting !== null}
          onClose={() => setCollecting(null)}
          paymentId={collecting?.paymentId ?? ''}
          amount={collecting?.amount ?? 0}
          patientName={collecting?.patientName}
        />
      </div>
  );
}
