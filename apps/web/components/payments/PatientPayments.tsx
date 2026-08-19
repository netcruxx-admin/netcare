'use client';

import { useState } from 'react';
import {
  CreditCard, Download, Eye, Smartphone, Building2, Wallet,
  ShieldCheck, Loader2, X,
} from 'lucide-react';
import type { Payment } from '@/lib/types';
import { fmtDate } from '@/lib/date';
import { DashboardShell } from '@/components/DashboardShell';
import type { RoleViewProps } from '@/components/RoleView';
import { useGetPatientPaymentsQuery } from '@/store/api';

export function PatientPayments({ session }: RoleViewProps) {
  const [invoicePayment, setInvoicePayment] = useState<Payment | null>(null);
  const [checkout, setCheckout] = useState<Payment | null>(null);

  const patientId = session?.patient?.id ?? '';
  const { data: payments = [], isLoading, refetch } = useGetPatientPaymentsQuery(patientId, { skip: !patientId });


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

        {/* Payment Methods */}
        <div className="bg-white rounded-lg shadow p-6 space-y-4">
          <h2 className="text-lg font-semibold text-slate-900">Saved Payment Methods</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="border-2 border-cyan-600 rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-3">
                <CreditCard className="w-6 h-6 text-cyan-600" />
                <span className="font-semibold text-slate-900">Debit/Credit Card</span>
              </div>
              <p className="text-slate-600 text-sm">Visa ending in 4242</p>
              <div className="flex gap-2 pt-2">
                <button className="text-cyan-600 hover:text-cyan-700 font-semibold text-sm">Use</button>
                <button className="text-red-600 hover:text-red-700 font-semibold text-sm">Remove</button>
              </div>
            </div>
            <div className="border border-slate-300 rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-3">
                <CreditCard className="w-6 h-6 text-slate-400" />
                <span className="font-semibold text-slate-900">Add Payment Method</span>
              </div>
              <p className="text-slate-600 text-sm">Securely save a new card or UPI</p>
              <button className="text-cyan-600 hover:text-cyan-700 font-semibold text-sm">Add New</button>
            </div>
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
                      <td className="py-3 px-4 text-slate-700">Appointment Consultation</td>
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
                      <td className="py-3 px-4 text-right space-x-2">
                        {payment.status === 'pending' && (
                          <button
                            onClick={() => setCheckout(payment)}
                            className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-gradient-to-r from-cyan-500 to-brand-teal text-white font-semibold text-sm hover:shadow"
                          >
                            <CreditCard className="w-4 h-4" /> Pay Now
                          </button>
                        )}
                        <button
                          onClick={() => setInvoicePayment(payment)}
                          className="text-cyan-600 hover:text-cyan-700 font-semibold text-sm"
                        >
                          <Eye className="w-4 h-4 inline mr-1" />
                          View
                        </button>
                        <button className="text-cyan-600 hover:text-cyan-700 font-semibold text-sm">
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

        {/* Checkout */}
        {checkout && (
          <CheckoutModal
            payment={checkout}
            onClose={() => setCheckout(null)}
            onPaid={() => {
              setCheckout(null);
              refetch();
            }}
          />
        )}

        {/* Invoice Modal */}
        {invoicePayment && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-8 space-y-4">
              <h2 className="text-2xl font-bold text-slate-900">Invoice</h2>
              <div className="space-y-4 text-sm text-slate-700">
                <div className="flex justify-between">
                  <span>Patient:</span>
                  <span className="font-semibold">{session.user.name}</span>
                </div>
                <div className="flex justify-between">
                  <span>Date:</span>
                  <span className="font-semibold">
                    {fmtDate(invoicePayment.createdAt)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Service:</span>
                  <span className="font-semibold">Appointment Consultation</span>
                </div>
                <div className="flex justify-between">
                  <span>Status:</span>
                  <span className="font-semibold capitalize">{invoicePayment.status}</span>
                </div>
                <div className="flex justify-between">
                  <span>Amount:</span>
                  <span className="font-semibold">₹{invoicePayment.amount}</span>
                </div>
                <div className="flex justify-between border-t pt-4">
                  <span className="font-semibold">Total:</span>
                  <span className="font-bold text-lg">₹{invoicePayment.amount}</span>
                </div>
              </div>
              <div className="flex gap-3 pt-6">
                <button
                  onClick={() => setInvoicePayment(null)}
                  className="flex-1 px-6 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition"
                >
                  Close
                </button>
                <button className="flex-1 px-6 py-2 bg-gradient-to-r from-cyan-500 to-brand-teal text-white rounded-lg hover:shadow-lg transition">
                  <Download className="w-4 h-4 inline mr-2" />
                  Download PDF
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}

type Method = 'upi' | 'card' | 'netbanking' | 'wallet';

const METHODS: { id: Method; label: string; icon: typeof Smartphone }[] = [
  { id: 'upi', label: 'UPI', icon: Smartphone },
  { id: 'card', label: 'Card', icon: CreditCard },
  { id: 'netbanking', label: 'Netbanking', icon: Building2 },
  { id: 'wallet', label: 'Wallet', icon: Wallet },
];

function CheckoutModal({
  payment,
  onClose,
  onPaid,
}: {
  payment: Payment;
  onClose: () => void;
  onPaid: () => void;
}) {
  const [method, setMethod] = useState<Method>('upi');
  const [processing, setProcessing] = useState(false);

  const pay = () => {
    setProcessing(true);
    // TODO (Phase 3): replace with real Razorpay/payment-gateway integration.
    // The form fields above (UPI ID, card number, etc.) are UI scaffolding only —
    // their values are intentionally unused until the gateway is wired up.
    setTimeout(onPaid, 1600);
  };

  const inputCls = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={processing ? undefined : onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-cyan-500 to-brand-teal text-white px-5 py-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium opacity-90">Secure Checkout</span>
            {!processing && (
              <button onClick={onClose} className="opacity-90 hover:opacity-100"><X className="w-5 h-5" /></button>
            )}
          </div>
          <p className="text-3xl font-bold mt-1">₹{payment.amount.toLocaleString('en-IN')}</p>
          <p className="text-xs opacity-90">Consultation charges</p>
        </div>

        {processing ? (
          <div className="py-14 flex flex-col items-center">
            <Loader2 className="w-10 h-10 text-cyan-600 animate-spin" />
            <p className="text-sm text-slate-600 mt-4">Processing payment…</p>
            <p className="text-xs text-slate-400 mt-1">Do not close this window</p>
          </div>
        ) : (
          <div className="p-5">
            {/* Method tabs */}
            <div className="grid grid-cols-4 gap-2 mb-4">
              {METHODS.map((m) => {
                const Icon = m.icon;
                const active = m.id === method;
                return (
                  <button
                    key={m.id}
                    onClick={() => setMethod(m.id)}
                    className={`flex flex-col items-center gap-1 py-2.5 rounded-lg border text-xs font-medium transition ${
                      active ? 'border-cyan-500 bg-cyan-50 text-cyan-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    {m.label}
                  </button>
                );
              })}
            </div>

            {/* Method fields (mock) */}
            <div className="space-y-3 min-h-[96px]">
              {method === 'upi' && (
                <label className="block">
                  <span className="text-xs font-medium text-slate-600">UPI ID</span>
                  <input placeholder="yourname@upi" className={`mt-1 ${inputCls}`} />
                </label>
              )}
              {method === 'card' && (
                <>
                  <label className="block">
                    <span className="text-xs font-medium text-slate-600">Card number</span>
                    <input placeholder="1234 5678 9012 3456" className={`mt-1 ${inputCls}`} />
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <input placeholder="MM/YY" className={inputCls} />
                    <input placeholder="CVV" className={inputCls} />
                  </div>
                </>
              )}
              {method === 'netbanking' && (
                <label className="block">
                  <span className="text-xs font-medium text-slate-600">Select bank</span>
                  <select className={`mt-1 ${inputCls}`}>
                    <option>HDFC Bank</option>
                    <option>State Bank of India</option>
                    <option>ICICI Bank</option>
                    <option>Axis Bank</option>
                  </select>
                </label>
              )}
              {method === 'wallet' && (
                <label className="block">
                  <span className="text-xs font-medium text-slate-600">Select wallet</span>
                  <select className={`mt-1 ${inputCls}`}>
                    <option>Paytm</option>
                    <option>PhonePe</option>
                    <option>Amazon Pay</option>
                  </select>
                </label>
              )}
            </div>

            <button
              onClick={pay}
              className="mt-4 w-full py-3 rounded-lg bg-gradient-to-r from-cyan-500 to-brand-teal text-white font-semibold hover:shadow-lg transition"
            >
              Pay ₹{payment.amount.toLocaleString('en-IN')}
            </button>
            <p className="flex items-center justify-center gap-1.5 text-xs text-slate-400 mt-3">
              <ShieldCheck className="w-3.5 h-3.5" /> Demo checkout — no real payment is processed
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
