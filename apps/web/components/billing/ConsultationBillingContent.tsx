'use client';

import { useState } from 'react';
import { useFormik } from 'formik';
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
} from 'lucide-react';
import { toast } from 'sonner';
import {
  useGetConsultationBillingSummaryQuery,
  useUpdatePaymentMutation,
} from '@/store/api';
import { apiError } from '@/lib/apiError';
import type { ConsultationBillingRow } from '@/lib/types';
import { openInvoicePrint } from '@/components/payments/printInvoice';
import { fmtCurrency, fmtTime, methodBadgeClass, methodLabel, todayIso } from './billingFormat';
import { DateRangeFilter, type DateRange } from '@/components/DateRangeFilter';
import { Table, TableHeader, TableBody, TableFooter, TableRow, TableHead, TableCell } from '@/components/ui/table';

/** How money is taken at the counter. Mirrors pricing.COUNTER_PAYMENT_MODES on
 *  the server — online payments settle themselves through the gateway. */
const COUNTER_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'card', label: 'Card' },
];

function KpiCard({
  label, amount, count, icon, tint,
}: {
  label: string;
  amount: number;
  count?: number;
  icon: React.ReactNode;
  tint: string;
}) {
  return (
    <div className="bg-white rounded-xl shadow p-5 flex items-start gap-4">
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

function Row({
  row, onPrint, canCollect,
}: {
  row: ConsultationBillingRow;
  onPrint: (id: string) => void;
  canCollect: boolean;
}) {
  const collected = row.status === 'completed';
  const [collecting, setCollecting] = useState(false);
  const [updatePayment] = useUpdatePaymentMutation();

  const formik = useFormik({
    initialValues: { method: 'cash' },
    onSubmit: async (values, { setSubmitting }) => {
      try {
        // Status and method together: "paid" without saying how is not something
        // the day-report can reconcile against a cash drawer.
        await updatePayment({
          id: row.paymentId,
          body: { status: 'completed', paymentMethod: values.method },
        }).unwrap();
        toast.success(`Collected ${fmtCurrency(row.amount)}`);
        setCollecting(false);
      } catch (err) {
        toast.error(apiError(err, 'Could not record the payment'));
      } finally {
        setSubmitting(false);
      }
    },
  });
  return (
    <TableRow className="border-b hover:bg-slate-50 transition">
      <TableCell className="py-3 px-4 text-xs font-mono text-slate-500">
        {row.invoiceNumber}
      </TableCell>
      <TableCell className="py-3 px-4 text-sm text-slate-500">{fmtTime(row.createdAt)}</TableCell>
      <TableCell className="py-3 px-4 whitespace-normal">
        <p className="text-sm font-medium text-slate-900">{row.patientName || '—'}</p>
        {row.patientPhone && <p className="text-xs text-slate-400">{row.patientPhone}</p>}
      </TableCell>
      <TableCell className="py-3 px-4 whitespace-normal">
        <p className="text-sm text-slate-800">{row.doctorName || '—'}</p>
        {row.departmentName && <p className="text-xs text-slate-400">{row.departmentName}</p>}
      </TableCell>
      <TableCell className="py-3 px-4 whitespace-normal">
        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
          {row.visitTypeLabel || row.visitType || '—'}
        </span>
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
            collecting ? (
              <>
                <select
                  name="method"
                  value={formik.values.method}
                  onChange={formik.handleChange}
                  className="border border-slate-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-cyan-500"
                >
                  {COUNTER_METHODS.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => formik.submitForm()}
                  disabled={formik.isSubmitting}
                  className="text-xs font-medium bg-green-600 text-white px-2.5 py-1 rounded-lg hover:bg-green-700 transition disabled:opacity-60"
                >
                  {formik.isSubmitting ? 'Saving…' : 'Confirm'}
                </button>
                <button
                  type="button"
                  onClick={() => { setCollecting(false); formik.resetForm(); }}
                  className="text-xs text-slate-500 px-1.5 py-1 hover:text-slate-700"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                onClick={() => setCollecting(true)}
                className="text-xs font-medium text-green-700 bg-green-50 border border-green-200 px-2.5 py-1 rounded-lg hover:bg-green-100 transition"
              >
                Mark Paid
              </button>
            )
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

/** The front desk's day-report: what was billed for consultations, what was
 *  collected, and what is still outstanding.
 *
 *  `canCollect` gates settling a bill from here — the same `payments.manage`
 *  the endpoint enforces. A viewer without it still sees what is outstanding;
 *  they just cannot say it has been paid. */
export function ConsultationBillingContent({ canCollect = false }: { canCollect?: boolean } = {}) {
  const [dateRange, setDateRange] = useState<DateRange>({ from: todayIso(), to: todayIso() });

  const { data: summary, isLoading, isFetching } = useGetConsultationBillingSummaryQuery(
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
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <DateRangeFilter value={dateRange} onChange={setDateRange} defaultDate={todayIso()} max={todayIso()} />
          {isToday && (
            <span className="text-xs font-medium bg-cyan-100 text-cyan-700 px-2 py-0.5 rounded-full">
              Today
            </span>
          )}
        </div>
        {isFetching && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
      </div>

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

      <div className="bg-white rounded-xl shadow">
        <div className="px-6 py-4 border-b flex items-center gap-2">
          <ReceiptText className="w-4 h-4 text-slate-500" />
          <h3 className="font-semibold text-slate-900">
            Consultations — {rangeLabel}
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
            <p className="text-slate-500 text-sm">No consultation bills for this period.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-b bg-slate-50 text-xs font-semibold text-slate-600 uppercase tracking-wide">
                  <TableHead className="py-3 px-4">Invoice</TableHead>
                  <TableHead className="py-3 px-4">Time</TableHead>
                  <TableHead className="py-3 px-4">Patient</TableHead>
                  <TableHead className="py-3 px-4">Doctor</TableHead>
                  <TableHead className="py-3 px-4">Visit Type</TableHead>
                  <TableHead className="py-3 px-4 text-right">Amount</TableHead>
                  <TableHead className="py-3 px-4">Status</TableHead>
                  <TableHead className="py-3 px-4 text-right">Print</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.rows.map((row) => (
                  <Row key={row.paymentId} row={row} onPrint={openInvoicePrint} canCollect={canCollect} />
                ))}
              </TableBody>
              <TableFooter>
                <TableRow className="border-t bg-slate-50">
                  <TableCell colSpan={5} className="py-3 px-4 text-sm font-semibold text-slate-700 text-right">
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
    </div>
  );
}
