'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { ClipboardList, Plus, X, AlertTriangle, Search, Receipt } from 'lucide-react';
import { apiError } from '@/lib/apiError';
import type { MedicationOrder, MedicationOrderStatus } from '@/lib/types';
import { DashboardShell } from '@/components/DashboardShell';
import type { RoleViewProps } from '@/components/RoleView';
import { hasPermission } from '@/lib/auth';
import {
  useListMedicationOrdersQuery,
  useCreateMedicationOrderMutation,
  useDispenseMedicationOrderMutation,
  useAdministerMedicationOrderMutation,
  useCancelMedicationOrderMutation,
  useBillMedicationOrderMutation,
  useListMedicinesQuery,
  useListPatientsQuery,
} from '@/store/api';
import { doctorRole, nurseRole, pharmacistRole } from '@/lib/roles';
import { fmtDate } from '@/lib/date';

type StatusTab = 'all' | MedicationOrderStatus;

const STATUS_TABS: { value: StatusTab; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'dispensed', label: 'Dispensed' },
  { value: 'administered', label: 'Administered' },
  { value: 'cancelled', label: 'Cancelled' },
];

const STATUS_BADGE: Record<MedicationOrderStatus, string> = {
  pending: 'bg-amber-100 text-amber-700',
  dispensed: 'bg-blue-100 text-blue-700',
  administered: 'bg-green-100 text-green-700',
  cancelled: 'bg-slate-100 text-slate-500',
};

const ROUTES = ['IV', 'IM', 'SC', 'Oral'] as const;

const TITLE_BY_ROLE: Record<string, string> = {
  [doctorRole]: 'My Orders',
  [nurseRole]: 'Orders to Administer',
  [pharmacistRole]: 'Dispense Queue',
};

const SUBTITLE_BY_ROLE: Record<string, string> = {
  [doctorRole]: 'Medication orders you have raised',
  [nurseRole]: 'Orders ready to be administered',
  [pharmacistRole]: 'Pending orders to dispense',
};

interface NewOrderForm {
  appointmentId: string;
  patientId: string;
  medicineId: string;
  medicineName: string;
  quantity: string;
  dosage: string;
  route: string;
  frequency: string;
  duration: string;
  instructions: string;
}

export function MedicationOrders({ session }: RoleViewProps) {
  const role = session.user.role;
  const [activeTab, setActiveTab] = useState<StatusTab>('all');
  const [search, setSearch] = useState('');
  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const [administerOrder, setAdministerOrder] = useState<MedicationOrder | null>(null);
  const [administerNotes, setAdministerNotes] = useState('');
  const [administerSite, setAdministerSite] = useState('');
  const [formError, setFormError] = useState('');
  const [billOrder, setBillOrder] = useState<MedicationOrder | null>(null);
  const [billMethod, setBillMethod] = useState<'cash' | 'card' | 'upi'>('cash');
  const [isBilling, setIsBilling] = useState(false);

  const [form, setForm] = useState<NewOrderForm>({
    appointmentId: '',
    patientId: '',
    medicineId: '',
    medicineName: '',
    quantity: '1',
    dosage: '',
    route: 'Oral',
    frequency: '',
    duration: '',
    instructions: '',
  });

  const queryArgs = {
    ...(activeTab !== 'all' && { status: activeTab }),
    ...(search.trim() && { q: search.trim() }),
  };
  const { data: orders = [], isLoading } = useListMedicationOrdersQuery(
    Object.keys(queryArgs).length ? queryArgs : undefined,
  );
  const { data: medicines = [] } = useListMedicinesQuery();
  const { data: patients = [] } = useListPatientsQuery();

  const [createOrder, { isLoading: isCreating }] = useCreateMedicationOrderMutation();
  const [dispenseOrder] = useDispenseMedicationOrderMutation();
  const [administerOrderMut] = useAdministerMedicationOrderMutation();
  const [cancelOrder] = useCancelMedicationOrderMutation();
  const [billMedicationOrder] = useBillMedicationOrderMutation();

  const canCreate = hasPermission(session, 'medication_orders.manage');
  const canDispense = hasPermission(session, 'medication_orders.dispense');
  const canAdminister = hasPermission(session, 'medication_orders.administer');

  const handleMedicineSelect = (id: string) => {
    const med = medicines.find((m) => m.id === id);
    const autoRoute = med
      ? med.form?.toLowerCase().includes('injection')
        ? 'IM'
        : 'Oral'
      : undefined;
    setForm((f) => ({
      ...f,
      medicineId: id,
      medicineName: med ? med.name : f.medicineName,
      ...(autoRoute ? { route: autoRoute } : {}),
    }));
  };

  const handleCreate = async () => {
    setFormError('');
    if (!form.patientId) { setFormError('Select a patient'); return; }
    if (!form.medicineName.trim()) { setFormError('Enter a medicine name'); return; }
    if (!form.dosage.trim()) { setFormError('Enter a dosage'); return; }
    if (!form.route) { setFormError('Select a route'); return; }
    // The number inventory moves by, so it is worth refusing here rather than
    // letting the server 422 after the rest of the form is filled in.
    const quantity = Number(form.quantity);
    if (!Number.isInteger(quantity) || quantity < 1) {
      setFormError('Quantity must be a whole number of at least 1');
      return;
    }
    const payload = {
      ...(form.appointmentId.trim() && { appointmentId: form.appointmentId.trim() }),
      patientId: form.patientId,
      medicineId: form.medicineId || undefined,
      medicineName: form.medicineName.trim(),
      quantity,
      dosage: form.dosage.trim(),
      route: form.route,
      frequency: form.frequency.trim(),
      duration: form.duration.trim(),
      instructions: form.instructions.trim(),
    };
    try {
      await createOrder(payload).unwrap();
      toast.success('Medication order created');
      setNewOrderOpen(false);
      setForm({ appointmentId: '', patientId: '', medicineId: '', medicineName: '', quantity: '1', dosage: '', route: 'Oral', frequency: '', duration: '', instructions: '' });
    } catch (err) {
      setFormError(apiError(err, 'Failed to create order'));
    }
  };

  const openDispenseModal = (order: MedicationOrder) => {
    setBillOrder(order);
    setBillMethod('cash');
  };

  const handleDispenseAndBill = async () => {
    if (!billOrder) return;
    setIsBilling(true);
    try {
      // 1. Dispense (moves stock, marks order dispensed)
      await dispenseOrder(billOrder.id).unwrap();
      // 2. Bill (creates Payment record)
      await billMedicationOrder({ id: billOrder.id, paymentMethod: billMethod }).unwrap();
      toast.success('Order dispensed and billed');
      setBillOrder(null);
    } catch (err) {
      toast.error(apiError(err, 'Failed to dispense/bill order'));
    } finally {
      setIsBilling(false);
    }
  };

  const handleAdminister = async () => {
    if (!administerOrder) return;
    const isInjection = ['IV', 'IM', 'SC'].includes(administerOrder.route);
    if (isInjection && !administerSite.trim()) {
      toast.error('Please enter the injection site (e.g. Left arm, IV line A)');
      return;
    }
    try {
      await administerOrderMut({ id: administerOrder.id, notes: administerNotes, site: administerSite }).unwrap();
      toast.success('Order marked as administered');
      setAdministerOrder(null);
      setAdministerNotes('');
      setAdministerSite('');
    } catch (err) {
      toast.error(apiError(err, 'Failed to administer order'));
    }
  };

  const handleCancel = async (id: string) => {
    try {
      await cancelOrder(id).unwrap();
      toast.success('Order cancelled');
    } catch (err) {
      toast.error(apiError(err, 'Failed to cancel order'));
    }
  };

  const showActions = orders.some(
    (o) =>
      (canDispense && o.status === 'pending') ||
      (canAdminister && o.status === 'dispensed') ||
      (canCreate && role === doctorRole && o.status === 'pending'),
  );

  return (
    <DashboardShell
      role={role}
      userName={session.user.name}
      title={TITLE_BY_ROLE[role] ?? 'Medication Orders'}
      subtitle={SUBTITLE_BY_ROLE[role] ?? 'In-hospital medication orders'}
    >
      <div className="space-y-6">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1 bg-white rounded-lg shadow px-1 py-1 flex-wrap">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => setActiveTab(tab.value)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${
                  activeTab === tab.value
                    ? 'bg-cyan-600 text-white shadow'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search patient name, phone or ID…"
              className="w-full pl-9 pr-3 py-1.5 bg-white rounded-lg shadow text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>

          {canCreate && role === doctorRole && (
            <button
              onClick={() => setNewOrderOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-cyan-500 to-brand-teal text-white rounded-lg text-sm font-medium hover:shadow-lg transition ml-auto"
            >
              <Plus className="w-4 h-4" />
              New Order
            </button>
          )}
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b">
            <h3 className="font-semibold text-slate-900">
              Medication Orders ({orders.length})
            </h3>
          </div>

          {isLoading ? (
            <div className="text-center py-16 text-slate-400">Loading…</div>
          ) : orders.length === 0 ? (
            <div className="text-center py-16">
              <ClipboardList className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-600">No medication orders found.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-slate-50">
                    <th className="text-left py-3 px-4 font-semibold text-slate-900">Patient</th>
                    <th className="text-left py-3 px-4 font-semibold text-slate-900">Medicine</th>
                    <th className="text-right py-3 px-4 font-semibold text-slate-900">Qty</th>
                    {canDispense && <th className="text-right py-3 px-4 font-semibold text-slate-900">Total</th>}
                    <th className="text-left py-3 px-4 font-semibold text-slate-900">Dosage</th>
                    <th className="text-left py-3 px-4 font-semibold text-slate-900">Route</th>
                    <th className="text-left py-3 px-4 font-semibold text-slate-900">Doctor</th>
                    <th className="text-left py-3 px-4 font-semibold text-slate-900">Ordered</th>
                    <th className="text-left py-3 px-4 font-semibold text-slate-900">Status</th>
                    {showActions && <th className="text-right py-3 px-4 font-semibold text-slate-900">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr key={order.id} className="border-b hover:bg-slate-50">
                      <td className="py-3 px-4">
                        <p className="font-medium text-slate-900">{order.patientName ?? order.patientId}</p>
                        {order.patientPhone && (
                          <p className="text-xs text-slate-500 mt-0.5">{order.patientPhone}</p>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-700">{order.medicineName}</td>
                      <td className="py-3 px-4 text-right font-medium text-slate-900 tabular-nums">
                        {order.quantity}
                      </td>
                      {canDispense && (
                        <td className="py-3 px-4 text-right tabular-nums text-slate-700">
                          {order.unitPrice > 0
                            ? `₹${(order.unitPrice * order.quantity).toFixed(2)}`
                            : '—'}
                        </td>
                      )}
                      <td className="py-3 px-4 text-slate-600">{order.dosage}</td>
                      <td className="py-3 px-4 text-slate-600">{order.route}</td>
                      <td className="py-3 px-4 text-slate-600">
                        {order.doctorName ?? order.doctorId}
                      </td>
                      <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                        {fmtDate(order.orderedAt)}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_BADGE[order.status]}`}
                        >
                          {order.status}
                        </span>
                      </td>
                      {showActions && <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {canDispense && order.status === 'pending' && (
                            <button
                              onClick={() => openDispenseModal(order)}
                              className="flex items-center gap-1 px-2 py-1 text-xs font-medium bg-blue-50 text-blue-700 rounded hover:bg-blue-100 transition"
                            >
                              <Receipt className="w-3 h-3" />
                              Dispense & Bill
                            </button>
                          )}
                          {canDispense && order.status === 'dispensed' && !order.alreadyBilled && (
                            <button
                              onClick={() => setBillOrder(order)}
                              className="flex items-center gap-1 px-2 py-1 text-xs font-medium bg-amber-50 text-amber-700 rounded hover:bg-amber-100 transition"
                            >
                              <Receipt className="w-3 h-3" />
                              Bill
                            </button>
                          )}
                          {canAdminister && order.status === 'dispensed' && (
                            <button
                              onClick={() => { setAdministerOrder(order); setAdministerNotes(''); setAdministerSite(''); }}
                              className="px-2 py-1 text-xs font-medium bg-green-50 text-green-700 rounded hover:bg-green-100 transition"
                            >
                              Administer
                            </button>
                          )}
                          {canCreate && role === doctorRole && order.status === 'pending' && (
                            <button
                              onClick={() => handleCancel(order.id)}
                              className="px-2 py-1 text-xs font-medium bg-red-50 text-red-700 rounded hover:bg-red-100 transition"
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* New Order Modal */}
      {newOrderOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-2xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-slate-900">New Medication Order</h3>
              <button onClick={() => setNewOrderOpen(false)} className="text-slate-500 hover:text-slate-900">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Patient *</label>
                <select
                  value={form.patientId}
                  onChange={(e) => setForm((f) => ({ ...f, patientId: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                >
                  <option value="">Select patient…</option>
                  {patients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.user?.name ?? p.userId}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Medicine</label>
                <select
                  value={form.medicineId}
                  onChange={(e) => handleMedicineSelect(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                >
                  <option value="">Select from catalog…</option>
                  {medicines.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.form} {m.strength})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Medicine Name *</label>
                <input
                  value={form.medicineName}
                  onChange={(e) => setForm((f) => ({ ...f, medicineName: e.target.value }))}
                  placeholder="Or type a name manually"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Quantity *</label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={form.quantity}
                    onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                  <p className="text-xs text-slate-400 mt-1">Units to dispense</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Dosage *</label>
                  <input
                    value={form.dosage}
                    onChange={(e) => setForm((f) => ({ ...f, dosage: e.target.value }))}
                    placeholder="e.g. 500 mg"
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Route *</label>
                  <select
                    value={form.route}
                    onChange={(e) => setForm((f) => ({ ...f, route: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  >
                    {ROUTES.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Frequency</label>
                  <input
                    value={form.frequency}
                    onChange={(e) => setForm((f) => ({ ...f, frequency: e.target.value }))}
                    placeholder="e.g. 8 hourly"
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Duration</label>
                  <input
                    value={form.duration}
                    onChange={(e) => setForm((f) => ({ ...f, duration: e.target.value }))}
                    placeholder="e.g. 5 days"
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Instructions</label>
                <textarea
                  value={form.instructions}
                  onChange={(e) => setForm((f) => ({ ...f, instructions: e.target.value }))}
                  placeholder="Special instructions…"
                  rows={2}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-none"
                />
              </div>

              {formError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {formError}
                </p>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setNewOrderOpen(false)}
                  className="flex-1 px-4 py-2 bg-slate-200 text-slate-700 rounded hover:bg-slate-300 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={isCreating}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-cyan-500 to-brand-teal text-white rounded hover:shadow-lg font-semibold transition disabled:opacity-50"
                >
                  {isCreating ? 'Creating…' : 'Create Order'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Dispense & Bill Modal */}
      {billOrder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-2xl max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-slate-900">Dispense &amp; Bill</h3>
              <button onClick={() => setBillOrder(null)} className="text-slate-500 hover:text-slate-900" disabled={isBilling}>
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Order summary */}
            <div className="bg-slate-50 rounded-lg p-4 mb-4 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Patient</span>
                <span className="font-medium text-slate-900">{billOrder.patientName ?? billOrder.patientId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Medicine</span>
                <span className="font-medium text-slate-900">{billOrder.medicineName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Quantity</span>
                <span className="font-medium text-slate-900">{billOrder.quantity}</span>
              </div>
              {billOrder.unitPrice > 0 && (
                <>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Unit Price</span>
                    <span className="text-slate-900">₹{billOrder.unitPrice.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between border-t pt-2 mt-2">
                    <span className="font-semibold text-slate-900">Total</span>
                    <span className="font-bold text-lg text-cyan-700">₹{(billOrder.unitPrice * billOrder.quantity).toFixed(2)}</span>
                  </div>
                </>
              )}
              {billOrder.unitPrice === 0 && (
                <p className="text-xs text-amber-600 mt-1">
                  No catalogue price — bill records ₹0. Update the medicine price to auto-calculate.
                </p>
              )}
            </div>

            {/* Payment method */}
            <div className="mb-5">
              <p className="text-sm font-medium text-slate-700 mb-2">Payment Method</p>
              <div className="flex gap-3">
                {([
                  { value: 'cash', label: 'Cash' },
                  { value: 'upi', label: 'UPI / QR' },
                  { value: 'card', label: 'Card' },
                ] as const).map((m) => (
                  <button
                    key={m.value}
                    onClick={() => setBillMethod(m.value)}
                    className={`flex-1 py-2 rounded-lg border text-sm font-medium transition ${
                      billMethod === m.value
                        ? 'border-cyan-500 bg-cyan-50 text-cyan-700'
                        : 'border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setBillOrder(null)}
                disabled={isBilling}
                className="flex-1 px-4 py-2 bg-slate-200 text-slate-700 rounded hover:bg-slate-300 transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={billOrder.status === 'pending' ? handleDispenseAndBill : async () => {
                  setIsBilling(true);
                  try {
                    await billMedicationOrder({ id: billOrder.id, paymentMethod: billMethod }).unwrap();
                    toast.success('Order billed');
                    setBillOrder(null);
                  } catch (err) {
                    toast.error(apiError(err, 'Failed to bill order'));
                  } finally {
                    setIsBilling(false);
                  }
                }}
                disabled={isBilling}
                className="flex-1 px-4 py-2 bg-gradient-to-r from-cyan-500 to-brand-teal text-white rounded hover:shadow-lg font-semibold transition disabled:opacity-50"
              >
                {isBilling
                  ? 'Processing…'
                  : billOrder.status === 'pending'
                  ? 'Dispense & Bill'
                  : 'Bill'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Administer Modal */}
      {administerOrder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-2xl max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-slate-900">Record Administration</h3>
              <button onClick={() => setAdministerOrder(null)} className="text-slate-500 hover:text-slate-900">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-slate-600 mb-4">
              Administering <span className="font-semibold">{administerOrder.medicineName}</span>{' '}
              {administerOrder.dosage} <span className="font-medium text-slate-700">({administerOrder.route})</span> to{' '}
              <span className="font-semibold">{administerOrder.patientName ?? administerOrder.patientId}</span>.
            </p>
            <div className="grid gap-3 mb-4">
              {['IV', 'IM', 'SC'].includes(administerOrder.route) && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Injection Site <span className="text-red-500">*</span>
                  </label>
                  <input
                    value={administerSite}
                    onChange={(e) => setAdministerSite(e.target.value)}
                    placeholder="e.g. Left arm, Right deltoid, IV line A"
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Notes (optional)</label>
                <textarea
                  value={administerNotes}
                  onChange={(e) => setAdministerNotes(e.target.value)}
                  placeholder="e.g. Patient tolerated well, no adverse reaction…"
                  rows={2}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-none"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setAdministerOrder(null)}
                className="flex-1 px-4 py-2 bg-slate-200 text-slate-700 rounded hover:bg-slate-300 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleAdminister}
                className="flex-1 px-4 py-2 bg-gradient-to-r from-cyan-500 to-brand-teal text-white rounded hover:shadow-lg font-semibold transition"
              >
                Mark Administered
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
