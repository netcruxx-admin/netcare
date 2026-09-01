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
import { useGetPharmacyBillingSummaryQuery, useLazyGetInvoiceQuery } from '@/store/api';
import type { PharmacyBillingRow } from '@/lib/types';

// ── helpers ──────────────────────────────────────────────────────────────────

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function fmtTime(isoStr: string): string {
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function fmtCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(amount);
}

function methodLabel(method: string): string {
  switch (method.toLowerCase()) {
    case 'cash': return 'Cash';
    case 'upi': case 'qr': return 'UPI';
    case 'card': return 'Card';
    case 'razorpay': return 'Online';
    default: return method || '—';
  }
}

function methodBadgeClass(method: string): string {
  switch (method.toLowerCase()) {
    case 'cash': return 'bg-green-100 text-green-700';
    case 'upi': case 'qr': return 'bg-violet-100 text-violet-700';
    case 'card': return 'bg-blue-100 text-blue-700';
    default: return 'bg-slate-100 text-slate-600';
  }
}

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
    <tr className="border-b hover:bg-slate-50 transition">
      <td className="py-3 px-4 text-xs font-mono text-slate-500 whitespace-nowrap">
        {row.invoiceNumber}
      </td>
      <td className="py-3 px-4 text-sm text-slate-500 whitespace-nowrap">
        {fmtTime(row.createdAt)}
      </td>
      <td className="py-3 px-4">
        <p className="text-sm font-medium text-slate-900">{row.patientName || '—'}</p>
        {row.patientPhone && (
          <p className="text-xs text-slate-400">{row.patientPhone}</p>
        )}
      </td>
      <td className="py-3 px-4">
        <p className="text-sm text-slate-800">{row.medicineName || '—'}</p>
        {row.dosage && <p className="text-xs text-slate-400">{row.dosage}</p>}
      </td>
      <td className="py-3 px-4 text-right text-sm tabular-nums text-slate-700">
        {row.quantity}
      </td>
      <td className="py-3 px-4 text-right text-sm tabular-nums text-slate-700">
        {fmtCurrency(row.unitPrice)}
      </td>
      <td className="py-3 px-4 text-right text-sm font-semibold tabular-nums text-slate-900">
        {fmtCurrency(row.amount)}
      </td>
      <td className="py-3 px-4">
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${methodBadgeClass(row.paymentMethod)}`}>
          {methodLabel(row.paymentMethod)}
        </span>
      </td>
      <td className="py-3 px-4 text-right">
        <button
          onClick={() => onPrint(row.paymentId)}
          title="Print invoice"
          className="p-1.5 rounded text-slate-400 hover:text-cyan-600 hover:bg-cyan-50 transition"
        >
          <Printer className="w-4 h-4" />
        </button>
      </td>
    </tr>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export function PharmacyBillingPage({ session }: RoleViewProps) {
  const [selectedDate, setSelectedDate] = useState<string>(todayIso());
  const [fetchInvoice] = useLazyGetInvoiceQuery();

  const { data: summary, isLoading, isFetching } = useGetPharmacyBillingSummaryQuery(
    { date: selectedDate },
    { refetchOnMountOrArgChange: true },
  );

  const isToday = selectedDate === todayIso();

  async function handlePrint(paymentId: string) {
    try {
      const invoice = await fetchInvoice(paymentId).unwrap();
      const win = window.open('', '_blank');
      if (!win) return;
      win.document.write(buildInvoiceHtml(invoice));
      win.document.close();
      win.print();
    } catch {
      // silent — user can retry
    }
  }

  return (
    <DashboardShell
      role={session.user.role}
      userName={session.user.name}
      title="Pharmacy Billing"
      subtitle="Daily collections and billing summary"
      loading={isLoading}
    >
      <div className="space-y-6">

        {/* date selector + refresh indicator */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <label htmlFor="billing-date" className="text-sm font-medium text-slate-700">
              Date
            </label>
            <input
              id="billing-date"
              type="date"
              value={selectedDate}
              max={todayIso()}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
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
              Bills — {selectedDate}
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
              <p className="text-slate-500 text-sm">No pharmacy bills for this date.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b bg-slate-50 text-xs font-semibold text-slate-600 uppercase tracking-wide">
                    <th className="py-3 px-4">Invoice</th>
                    <th className="py-3 px-4">Time</th>
                    <th className="py-3 px-4">Patient</th>
                    <th className="py-3 px-4">Medicine</th>
                    <th className="py-3 px-4 text-right">Qty</th>
                    <th className="py-3 px-4 text-right">Unit Price</th>
                    <th className="py-3 px-4 text-right">Amount</th>
                    <th className="py-3 px-4">Method</th>
                    <th className="py-3 px-4 text-right">Print</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.rows.map((row) => (
                    <BillingRow key={row.paymentId} row={row} onPrint={handlePrint} />
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t bg-slate-50">
                    <td colSpan={6} className="py-3 px-4 text-sm font-semibold text-slate-700 text-right">
                      Total
                    </td>
                    <td className="py-3 px-4 text-right text-sm font-bold text-slate-900 tabular-nums">
                      {fmtCurrency(summary.total)}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}

// ── minimal invoice HTML for browser print ────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildInvoiceHtml(invoice: any): string {
  const lines = (invoice.lines ?? [])
    .map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (l: any) => `
        <tr>
          <td style="padding:6px 0;border-bottom:1px solid #eee">${l.description}</td>
          <td style="padding:6px 0;border-bottom:1px solid #eee;text-align:center">${l.quantity}</td>
          <td style="padding:6px 0;border-bottom:1px solid #eee;text-align:right">₹${l.unitPrice.toFixed(2)}</td>
          <td style="padding:6px 0;border-bottom:1px solid #eee;text-align:right">₹${l.amount.toFixed(2)}</td>
        </tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${invoice.number}</title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 13px; color: #222; margin: 0; padding: 24px; }
    h1 { font-size: 18px; margin: 0 0 4px; }
    h2 { font-size: 14px; margin: 0 0 16px; color: #555; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; font-size: 11px; text-transform: uppercase; color: #888; padding: 4px 0; border-bottom: 2px solid #222; }
    th:nth-child(n+2) { text-align: right; }
    .meta { display: flex; justify-content: space-between; margin-bottom: 20px; }
    .label { color: #888; font-size: 11px; }
    .total-row td { font-weight: bold; padding-top: 10px; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <h1>${invoice.seller?.name || 'Hospital'}</h1>
  <h2>${invoice.seller?.address || ''}</h2>
  <div class="meta">
    <div>
      <div class="label">Invoice No</div>
      <div>${invoice.number}</div>
      <div class="label" style="margin-top:8px">Patient</div>
      <div>${invoice.patientName || '—'}</div>
      ${invoice.patientPhone ? `<div style="color:#555">${invoice.patientPhone}</div>` : ''}
    </div>
    <div style="text-align:right">
      <div class="label">Date</div>
      <div>${new Date(invoice.issuedAt).toLocaleDateString('en-IN')}</div>
      <div class="label" style="margin-top:8px">Method</div>
      <div style="text-transform:capitalize">${invoice.paymentMethod || '—'}</div>
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th style="width:50%">Description</th>
        <th>Qty</th>
        <th>Unit Price</th>
        <th>Amount</th>
      </tr>
    </thead>
    <tbody>${lines}</tbody>
    <tfoot>
      <tr class="total-row">
        <td colspan="3" style="text-align:right;padding-top:10px">Total (${invoice.currency || 'INR'})</td>
        <td style="text-align:right;padding-top:10px">₹${(invoice.total ?? 0).toFixed(2)}</td>
      </tr>
    </tfoot>
  </table>
  ${invoice.seller?.gstin ? `<p style="margin-top:20px;font-size:11px;color:#888">GSTIN: ${invoice.seller.gstin}</p>` : ''}
</body>
</html>`;
}
