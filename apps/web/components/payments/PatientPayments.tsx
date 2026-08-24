'use client';

import { useState } from 'react';
import { CreditCard, Download, Eye, Banknote, Loader2, X, Smartphone } from 'lucide-react';
import type { Payment } from '@/lib/types';
import { fmtDate } from '@/lib/date';
import { DashboardShell } from '@/components/DashboardShell';
import type { RoleViewProps } from '@/components/RoleView';
import {
  useGetCurrentHospitalQuery,
  useGetPatientPaymentsQuery,
  useLazyGetInvoiceQuery,
} from '@/store/api';
import { toast } from 'sonner';
import { apiError } from '@/lib/apiError';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function paymentTypeLabel(type?: string) {
  if (type === 'pharmacy') return 'Pharmacy';
  if (type === 'lab') return 'Lab';
  return 'Consultation';
}

function paymentMethodLabel(method: string) {
  if (method === 'razorpay') return 'Online (Razorpay)';
  if (method === 'cash') return 'Cash';
  if (method === 'card') return 'Card';
  if (method === 'upi') return 'UPI / QR';
  if (!method) return '—';
  return method.charAt(0).toUpperCase() + method.slice(1);
}

function paymentMethodIcon(method: string) {
  if (method === 'cash') return <Banknote className="w-4 h-4 inline mr-1 text-slate-400" />;
  if (method === 'razorpay' || method === 'upi') return <Smartphone className="w-4 h-4 inline mr-1 text-slate-400" />;
  return <CreditCard className="w-4 h-4 inline mr-1 text-slate-400" />;
}

// ---------------------------------------------------------------------------
// PDF download — opens a styled print window and triggers Save as PDF
// ---------------------------------------------------------------------------

interface HospitalMeta {
  name: string;
  legalName?: string;
  gstin?: string;
  tagline?: string;
  address?: string;
  phone?: string;
  /** Printed across the top when the hospital has uploaded one. */
  letterheadUrl?: string;
  number?: string;
}

function downloadInvoicePdf(payment: Payment, patientName: string, hospital: HospitalMeta) {
  const statusColor =
    payment.status === 'completed' ? '#16a34a' :
    payment.status === 'pending'   ? '#d97706' : '#dc2626';

  const txRow = payment.gatewayPaymentId
    ? `<tr><td class="label">Transaction ID</td><td class="value mono">${payment.gatewayPaymentId}</td></tr>`
    : '';

  const gstRow = hospital.gstin
    ? `<p class="meta">GSTIN: ${hospital.gstin}</p>`
    : '';

  const displayName = hospital.legalName || hospital.name;
  const tagline = hospital.tagline ? `<p class="tagline">${hospital.tagline}</p>` : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Invoice — ${displayName}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; background: #fff; padding: 48px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; }
  .hospital-name { font-size: 22px; font-weight: 700; color: #0f172a; }
  .tagline { font-size: 13px; color: #64748b; margin-top: 3px; }
  .meta { font-size: 12px; color: #94a3b8; margin-top: 2px; }
  .invoice-label { font-size: 28px; font-weight: 700; color: #0f172a; text-align: right; }
  .divider { border: none; border-top: 1px solid #e2e8f0; margin: 24px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 10px 0; font-size: 14px; }
  td.label { color: #64748b; width: 45%; }
  td.value { font-weight: 600; color: #0f172a; text-align: right; }
  td.mono { font-family: monospace; font-size: 12px; }
  .total-row td { font-size: 17px; font-weight: 700; border-top: 2px solid #e2e8f0; padding-top: 16px; }
  .status { display: inline-block; padding: 2px 10px; border-radius: 99px; font-size: 13px;
            font-weight: 600; background: ${statusColor}22; color: ${statusColor}; }
  .footer { margin-top: 48px; font-size: 12px; color: #94a3b8; text-align: center; }
  @media print {
    body { padding: 32px; }
    @page { margin: 1cm; }
  }
</style>
</head>
<body>
<div class="header">
  <div>
    <div class="hospital-name">${displayName}</div>
    ${tagline}
    ${gstRow}
  </div>
  <div class="invoice-label">Invoice</div>
</div>

<table>
  <tr><td class="label">Patient</td><td class="value">${patientName}</td></tr>
  <tr><td class="label">Date</td><td class="value">${fmtDate(payment.createdAt)}</td></tr>
  <tr><td class="label">Invoice No.</td><td class="value mono">${payment.id}</td></tr>
  <tr><td class="label">Service</td><td class="value">${paymentTypeLabel(payment.paymentType)}</td></tr>
  <tr><td class="label">Payment Mode</td><td class="value">${paymentMethodLabel(payment.paymentMethod)}</td></tr>
  ${txRow}
  <tr>
    <td class="label">Status</td>
    <td class="value"><span class="status">${payment.status.charAt(0).toUpperCase() + payment.status.slice(1)}</span></td>
  </tr>
</table>

<hr class="divider" />

<table>
  <tr class="total-row">
    <td class="label">Total Amount</td>
    <td class="value">&#8377;${payment.amount}</td>
  </tr>
</table>

<div class="footer">
  ${displayName} &bull; This is a computer-generated invoice and does not require a signature.
</div>

<script>window.onload = () => { window.print(); }<\/script>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=700,height=900');
  if (!win) return; // popup blocked
  win.document.write(html);
  win.document.close();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PatientPayments({ session }: RoleViewProps) {
  const [invoicePayment, setInvoicePayment] = useState<Payment | null>(null);

  const patientId = session?.patient?.id ?? '';
  const { data: payments = [], isLoading } = useGetPatientPaymentsQuery(patientId, { skip: !patientId });
  const { data: hospitalData } = useGetCurrentHospitalQuery();
  // The seller block — legal name, GSTIN, letterhead — is fetched per bill
  // from GET /payments/{id}/invoice. It cannot come from the hospital config
  // here: that endpoint is public, and a PAN or GSTIN has no business being
  // readable by anyone who loads the login page.
  const [fetchInvoice] = useLazyGetInvoiceQuery();

  const printInvoice = async (payment: Payment, name: string) => {
    try {
      const invoice = await fetchInvoice(payment.id).unwrap();
      downloadInvoicePdf(payment, name, {
        name: invoice.seller.name || hospitalData?.name || 'Hospital',
        legalName: invoice.seller.legalName,
        gstin: invoice.seller.gstin,
        tagline: hospitalData?.tagline,
        address: invoice.seller.address,
        phone: invoice.seller.phone,
        letterheadUrl: invoice.seller.letterheadUrl,
        number: invoice.number,
      });
    } catch (err) {
      toast.error(apiError(err, 'Could not prepare the invoice'));
    }
  };

  const totalPaid = payments.filter((p) => p.status === 'completed').reduce((sum, p) => sum + p.amount, 0);
  const pendingAmount = payments.filter((p) => p.status === 'pending').reduce((sum, p) => sum + p.amount, 0);

  return (
    <DashboardShell
      role={session.user.role}
      userName={session.user.name}
      title="Payments & Billing"
      subtitle="Your transactions and invoices"
    >
      <div className="space-y-8">
        {/* Summary Cards */}
        <div className="grid md:grid-cols-3 gap-6">
          <div className="bg-green-50 rounded-lg p-6 border border-green-200">
            <p className="text-green-700 text-sm font-medium mb-2">Total Paid</p>
            <p className="text-3xl font-bold text-green-600">₹{totalPaid}</p>
          </div>
          <div className="bg-orange-50 rounded-lg p-6 border border-orange-200">
            <p className="text-orange-700 text-sm font-medium mb-2">Pending Amount</p>
            <p className="text-3xl font-bold text-orange-600">₹{pendingAmount}</p>
          </div>
          <div className="bg-cyan-50 rounded-lg p-6 border border-cyan-200">
            <p className="text-cyan-700 text-sm font-medium mb-2">Total Transactions</p>
            <p className="text-3xl font-bold text-cyan-600">{payments.length}</p>
          </div>
        </div>

        {/* Transaction History */}
        <div className="bg-white rounded-lg shadow p-6 space-y-4">
          <h2 className="text-lg font-semibold text-slate-900">Transaction History</h2>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
            </div>
          ) : payments.length === 0 ? (
            <div className="text-center py-12">
              <CreditCard className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-600">No transactions yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-semibold text-slate-900">Date</th>
                    <th className="text-left py-3 px-4 font-semibold text-slate-900">Type</th>
                    <th className="text-left py-3 px-4 font-semibold text-slate-900">Amount</th>
                    <th className="text-left py-3 px-4 font-semibold text-slate-900">Status</th>
                    <th className="text-right py-3 px-4 font-semibold text-slate-900">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((payment) => (
                    <tr key={payment.id} className="border-b hover:bg-slate-50">
                      <td className="py-3 px-4 text-slate-700">
                        {fmtDate(payment.createdAt)}
                      </td>
                      <td className="py-3 px-4 text-slate-700">
                        <p className="font-medium">{paymentTypeLabel(payment.paymentType)}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {paymentMethodIcon(payment.paymentMethod)}
                          {paymentMethodLabel(payment.paymentMethod)}
                        </p>
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-900">₹{payment.amount}</td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-block px-3 py-1 rounded-full text-sm font-semibold ${
                            payment.status === 'completed'
                              ? 'bg-green-100 text-green-700'
                              : payment.status === 'pending'
                              ? 'bg-orange-100 text-orange-700'
                              : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {payment.status.charAt(0).toUpperCase() + payment.status.slice(1)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right space-x-3">
                        {payment.status === 'pending' && payment.paymentMethod === 'cash' && (
                          <span className="text-xs text-orange-600 font-medium">Pay at counter</span>
                        )}
                        <button
                          onClick={() => setInvoicePayment(payment)}
                          className="text-cyan-600 hover:text-cyan-700 font-semibold text-sm"
                        >
                          <Eye className="w-4 h-4 inline mr-1" />
                          View
                        </button>
                        <button
                          onClick={() => printInvoice(payment, session.user.name)}
                          className="text-cyan-600 hover:text-cyan-700 font-semibold text-sm"
                        >
                          <Download className="w-4 h-4 inline mr-1" />
                          Download
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Invoice Modal */}
        {invoicePayment && (
          <InvoiceModal
            payment={invoicePayment}
            patientName={session.user.name}
            onPrint={printInvoice}
            onClose={() => setInvoicePayment(null)}
          />
        )}
      </div>
    </DashboardShell>
  );
}

// ---------------------------------------------------------------------------
// Invoice Modal
// ---------------------------------------------------------------------------

function InvoiceModal({
  payment,
  patientName,
  onPrint,
  onClose,
}: {
  payment: Payment;
  patientName: string;
  /** Fetches the seller block and opens the printable bill. */
  onPrint: (payment: Payment, patientName: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-8 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-slate-900">Invoice</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3 text-sm text-slate-700">
          <div className="flex justify-between">
            <span className="text-slate-500">Patient</span>
            <span className="font-semibold">{patientName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Date</span>
            <span className="font-semibold">{fmtDate(payment.createdAt)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Invoice No.</span>
            <span className="font-semibold font-mono text-xs">{payment.id}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Service</span>
            <span className="font-semibold">{paymentTypeLabel(payment.paymentType)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Payment Mode</span>
            <span className="font-semibold">{paymentMethodLabel(payment.paymentMethod)}</span>
          </div>
          {payment.gatewayPaymentId && (
            <div className="flex justify-between">
              <span className="text-slate-500">Transaction ID</span>
              <span className="font-semibold font-mono text-xs">{payment.gatewayPaymentId}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-slate-500">Status</span>
            <span className={`font-semibold capitalize ${
              payment.status === 'completed' ? 'text-green-600' :
              payment.status === 'pending' ? 'text-orange-600' : 'text-red-600'
            }`}>
              {payment.status}
            </span>
          </div>
          <div className="flex justify-between border-t pt-3 mt-3">
            <span className="font-semibold text-slate-900">Total</span>
            <span className="font-bold text-lg text-slate-900">₹{payment.amount}</span>
          </div>
        </div>

        <div className="flex gap-3 pt-4">
          <button
            onClick={onClose}
            className="flex-1 px-6 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition"
          >
            Close
          </button>
          <button
            onClick={() => onPrint(payment, patientName)}
            className="flex-1 px-6 py-2 bg-gradient-to-r from-cyan-500 to-brand-teal text-white rounded-lg hover:shadow-lg transition"
          >
            <Download className="w-4 h-4 inline mr-2" />
            Download PDF
          </button>
        </div>
      </div>
    </div>
  );
}
