'use client';

import { useState } from 'react';
import { CreditCard, Download, Eye, Banknote, X, Smartphone } from 'lucide-react';
import type { Payment } from '@/lib/types';
import { fmtDate } from '@/lib/date';
import { formatINR } from '@/lib/money';
import { DashboardShell } from '@/components/DashboardShell';
import type { RoleViewProps } from '@/components/RoleView';
import { useGetPatientPaymentsQuery } from '@/store/api';
import { openInvoicePrint } from '@/components/payments/printInvoice';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

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
// Component
// ---------------------------------------------------------------------------

export function PatientPayments({ session }: RoleViewProps) {
  const [invoicePayment, setInvoicePayment] = useState<Payment | null>(null);

  const patientId = session?.patient?.id ?? '';
  const { data: payments = [], isLoading } = useGetPatientPaymentsQuery(patientId, { skip: !patientId });
  // The bill — seller block, letterhead and all — is assembled by the
  // /print/invoice route from GET /payments/{id}/invoice. Nothing to fetch here.

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
            <p className="text-3xl font-bold text-green-600">{formatINR(totalPaid)}</p>
          </div>
          <div className="bg-orange-50 rounded-lg p-6 border border-orange-200">
            <p className="text-orange-700 text-sm font-medium mb-2">Pending Amount</p>
            <p className="text-3xl font-bold text-orange-600">{formatINR(pendingAmount)}</p>
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
            <Spinner variant="block" />
          ) : payments.length === 0 ? (
            <div className="text-center py-12">
              <CreditCard className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-600">No transactions yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-b">
                    <TableHead className="text-left py-3 px-4 font-semibold text-slate-900">Date</TableHead>
                    <TableHead className="text-left py-3 px-4 font-semibold text-slate-900">Type</TableHead>
                    <TableHead className="text-left py-3 px-4 font-semibold text-slate-900">Amount</TableHead>
                    <TableHead className="text-left py-3 px-4 font-semibold text-slate-900">Status</TableHead>
                    <TableHead className="text-right py-3 px-4 font-semibold text-slate-900">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((payment) => (
                    <TableRow key={payment.id} className="border-b hover:bg-slate-50">
                      <TableCell className="py-3 px-4 text-slate-700 whitespace-normal">
                        {fmtDate(payment.createdAt)}
                      </TableCell>
                      <TableCell className="py-3 px-4 text-slate-700 whitespace-normal">
                        <p className="font-medium">{paymentTypeLabel(payment.paymentType)}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {paymentMethodIcon(payment.paymentMethod)}
                          {paymentMethodLabel(payment.paymentMethod)}
                        </p>
                      </TableCell>
                      <TableCell className="py-3 px-4 font-semibold text-slate-900 whitespace-normal">{formatINR(payment.amount)}</TableCell>
                      <TableCell className="py-3 px-4 whitespace-normal">
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
                      </TableCell>
                      <TableCell className="py-3 px-4 text-right space-x-3 whitespace-normal">
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
                          onClick={() => openInvoicePrint(payment.id)}
                          className="text-cyan-600 hover:text-cyan-700 font-semibold text-sm"
                        >
                          <Download className="w-4 h-4 inline mr-1" />
                          Download
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        {/* Invoice Modal */}
        {invoicePayment && (
          <InvoiceModal
            payment={invoicePayment}
            patientName={session.user.name}
            onPrint={openInvoicePrint}
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
  /** Opens the printable bill for this payment. */
  onPrint: (paymentId: string) => void;
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
            <span className="font-bold text-lg text-slate-900">{formatINR(payment.amount)}</span>
          </div>
        </div>

        <div className="flex gap-3 pt-4">
          <button
            onClick={onClose}
            className="flex-1 px-6 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition"
          >
            Close
          </button>
          <Button
            onClick={() => onPrint(payment.id)}
            variant="brand"
            className="flex-1"
          >
            <Download className="w-4 h-4 inline mr-2" />
            Print / Save PDF
          </Button>
        </div>
      </div>
    </div>
  );
}
