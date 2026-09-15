'use client';

import { useParams } from 'next/navigation';
import { useDashboardGuard } from '@/hooks/useDashboardGuard';
import { useGetInvoiceQuery } from '@/store/api';
import { PrintSheet } from '@/components/print/PrintSheet';
import { Spinner } from '@/components/ui/spinner';
import { formatINR } from '@/lib/money';

const money = (n: number) => formatINR(n);

/**
 * One bill as a print sheet.
 *
 * The seller block — legal name, GSTIN, letterhead — comes from
 * GET /payments/{id}/invoice, which is permission-guarded and scoped: a bill
 * that is not the caller's is a 404 here, so there is no separate access check.
 * `useDashboardGuard` only ensures there is a session to make the call with.
 */
export default function InvoicePrintPage() {
  const params = useParams();
  const paymentId = params.paymentId as string;

  const session = useDashboardGuard();
  const { data: invoice, isLoading, isError } = useGetInvoiceQuery(paymentId, {
    skip: !paymentId || !session,
  });

  if (!session) return null;

  if (isLoading) {
    return <Spinner variant="page" label="Loading invoice…" />;
  }

  if (!invoice || isError) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
        <p className="text-slate-600">Invoice not found.</p>
        <button onClick={() => window.close()} className="font-semibold text-cyan-600">
          Close
        </button>
      </div>
    );
  }

  // Injectables and lab tests bill on a plain page — never the hospital
  // letterhead — regardless of whether one is configured.
  const forcePlain = invoice.paymentType === 'injectable' || invoice.paymentType === 'lab';
  const isInjectable = invoice.paymentType === 'injectable';
  const isLab = invoice.paymentType === 'lab';

  return (
    <PrintSheet header={invoice.seller} docLabel="Tax Invoice" docNumber={invoice.number} ready autoPrint forcePlain={forcePlain}>
      <div className="mb-6 flex flex-wrap justify-between gap-4 text-sm">
        <div>
          <p className="text-xs text-slate-500">Billed to</p>
          <p className="font-medium text-slate-900">{invoice.patientName || 'Patient'}</p>
          {invoice.patientPhone && <p className="text-slate-500">{invoice.patientPhone}</p>}
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-500">Issued</p>
          <p className="font-medium text-slate-900">
            {new Date(invoice.issuedAt).toLocaleString('en-IN')}
          </p>
          <p className="text-slate-500 capitalize">
            {(invoice.paymentMethod || '—')} · {invoice.status}
          </p>
        </div>
      </div>

      {isInjectable ? (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-slate-800 text-left text-xs uppercase tracking-wide text-slate-500">
              {invoice.showSerialNumber !== false && <th className="py-2 w-10">S.No</th>}
              {invoice.showItemName !== false && <th className="py-2">Injectable</th>}
              <th className="py-2 text-right">Qty</th>
              {invoice.showPrice !== false && <th className="py-2 text-right">Price</th>}
              {invoice.showDiscount !== false && <th className="py-2 text-right">Discount</th>}
              {invoice.showTotal !== false && <th className="py-2 text-right">Total</th>}
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((line, i) => (
              <tr key={i} className="border-b border-slate-100">
                {invoice.showSerialNumber !== false && (
                  <td className="py-2.5 text-slate-800">{line.serialNumber ?? i + 1}</td>
                )}
                {invoice.showItemName !== false && (
                  <td className="py-2.5 text-slate-800">{line.description}</td>
                )}
                <td className="py-2.5 text-right tabular-nums">{line.quantity}</td>
                {invoice.showPrice !== false && (
                  <td className="py-2.5 text-right tabular-nums">{money(line.unitPrice)}</td>
                )}
                {invoice.showDiscount !== false && (
                  <td className="py-2.5 text-right tabular-nums">{money(line.discount || 0)}</td>
                )}
                {invoice.showTotal !== false && (
                  <td className="py-2.5 text-right tabular-nums">{money(line.amount)}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-slate-800 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2">Description</th>
              <th className="py-2 text-right">Qty</th>
              <th className="py-2 text-right">Rate</th>
              <th className="py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((line, i) => (
              <tr key={i} className="border-b border-slate-100">
                <td className="py-2.5 text-slate-800">{line.description}</td>
                <td className="py-2.5 text-right tabular-nums">{line.quantity}</td>
                <td className="py-2.5 text-right tabular-nums">{money(line.unitPrice)}</td>
                <td className="py-2.5 text-right tabular-nums">{money(line.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="mt-4 space-y-1.5 text-sm text-slate-700">
        {isLab && invoice.showGst && (
          <>
            <div className="flex justify-end gap-10">
              <span>Subtotal</span>
              <span className="tabular-nums">{money(invoice.subtotal ?? invoice.total)}</span>
            </div>
            {invoice.gstSplit ? (
              <>
                <div className="flex justify-end gap-10">
                  <span>CGST</span>
                  <span className="tabular-nums">{money(invoice.cgstAmount ?? 0)}</span>
                </div>
                <div className="flex justify-end gap-10">
                  <span>SGST</span>
                  <span className="tabular-nums">{money(invoice.sgstAmount ?? 0)}</span>
                </div>
              </>
            ) : (
              <div className="flex justify-end gap-10">
                <span>GST{invoice.gstRate ? ` (${invoice.gstRate}%)` : ''}</span>
                <span className="tabular-nums">{money(invoice.gstAmount ?? 0)}</span>
              </div>
            )}
          </>
        )}
        <div className="flex justify-end gap-10 text-base font-bold text-slate-900">
          <span>Total ({invoice.currency || 'INR'})</span>
          <span className="tabular-nums">{money(invoice.total)}</span>
        </div>
      </div>

      {invoice.seller.gstin && (
        <p className="mt-6 text-xs text-slate-500">GSTIN: {invoice.seller.gstin}</p>
      )}
    </PrintSheet>
  );
}
