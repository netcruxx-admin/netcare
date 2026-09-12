'use client';

import { useMemo, useState } from 'react';
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import { toast } from 'sonner';
import { ClipboardList, Plus, X, AlertTriangle, Search, Receipt, ChevronRight } from 'lucide-react';
import { apiError } from '@/lib/apiError';
import type { MedicationOrder, MedicationOrderStatus } from '@/lib/types';
import { DashboardShell } from '@/components/DashboardShell';
import { FormField } from '@/components/form/FormField';
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
import { formatINR } from '@/lib/money';
import { openInvoicePrint } from '@/components/payments/printInvoice';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

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

const newOrderSchema = Yup.object({
  patientId: Yup.string().required('Select a patient'),
  medicineName: Yup.string().trim().required('Enter a medicine name'),
  dosage: Yup.string().trim().required('Enter a dosage'),
  route: Yup.string().required('Select a route'),
  quantity: Yup.string().test('qty', 'Quantity must be a whole number of at least 1', (v) => {
    const n = Number(v);
    return Number.isInteger(n) && n >= 1;
  }),
});

interface DispenseBillValues {
  medicineId: string;
  quantity: string;
  method: 'cash' | 'upi' | 'card';
}

const dispenseBillSchema = Yup.object({
  quantity: Yup.string().test('qty', 'Quantity must be a whole number of at least 1', (v) => {
    const n = Number(v);
    return Number.isInteger(n) && n >= 1;
  }),
});

interface AdministerValues {
  site: string;
  notes: string;
}

export function MedicationOrders({ session }: RoleViewProps) {
  const role = session.user.role;
  const [activeTab, setActiveTab] = useState<StatusTab>('all');
  const [search, setSearch] = useState('');
  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const [administerOrder, setAdministerOrder] = useState<MedicationOrder | null>(null);
  const [formError, setFormError] = useState('');
  const [billOrder, setBillOrder] = useState<MedicationOrder | null>(null);
  //: The payment just created, offered as a printable bill. Held separately
  //: from billOrder so the offer survives the modal closing.
  const [printable, setPrintable] = useState<string | null>(null);
  //: Which patients are opened. Collapsed by default: the queue is worked one
  //: patient at a time — everything they were prescribed is handed over
  //: together — so the useful unit is the person, not the line item.
  const [openPatients, setOpenPatients] = useState<Set<string>>(new Set());

  const NEW_ORDER_INITIAL: NewOrderForm = {
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
  };

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

  /** One entry per patient, in the order their oldest item was raised, so the
   *  person who has been waiting longest is at the top. */
  const grouped = useMemo(() => {
    const byPatient = new Map<string, {
      patientId: string; patientName: string; patientPhone: string;
      orders: MedicationOrder[];
    }>();
    for (const order of orders) {
      const key = order.patientId;
      const entry = byPatient.get(key) ?? {
        patientId: key,
        patientName: order.patientName ?? key,
        patientPhone: order.patientPhone ?? '',
        orders: [],
      };
      entry.orders.push(order);
      byPatient.set(key, entry);
    }
    return [...byPatient.values()].sort((a, b) => {
      const oldest = (g: { orders: MedicationOrder[] }) =>
        g.orders.reduce((min, o) => (o.orderedAt < min ? o.orderedAt : min), g.orders[0].orderedAt);
      return oldest(a) < oldest(b) ? -1 : 1;
    });
  }, [orders]);

  const togglePatient = (patientId: string) =>
    setOpenPatients((current) => {
      const next = new Set(current);
      if (next.has(patientId)) next.delete(patientId);
      else next.add(patientId);
      return next;
    });

  const canCreate = hasPermission(session, 'medication_orders.manage');
  const canDispense = hasPermission(session, 'medication_orders.dispense');
  const canAdminister = hasPermission(session, 'medication_orders.administer');


  const openDispenseModal = (order: MedicationOrder) => {
    setBillOrder(order);
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
  // Medicine, Qty, Dosage, Route, Doctor, Ordered, Status — plus Total and
  // Actions when those columns are rendered.
  const COLUMN_COUNT = 7 + (canDispense ? 1 : 0) + (showActions ? 1 : 0);

  return (
    <DashboardShell
      role={role}
      userName={session.user.name}
      title={TITLE_BY_ROLE[role] ?? 'Medication Orders'}
      subtitle={SUBTITLE_BY_ROLE[role] ?? 'In-hospital medication orders'}
    >
      <div className="space-y-6">
        {/* Status tabs */}
        <div className="border-b border-slate-200">
          <nav className="flex gap-1 flex-wrap" aria-label="Order status">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => setActiveTab(tab.value)}
                aria-current={activeTab === tab.value ? 'page' : undefined}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition ${
                  activeTab === tab.value
                    ? 'border-cyan-600 text-cyan-700'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3">
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
            <Button
              onClick={() => setNewOrderOpen(true)}
              variant="brand"
              size="sm"
              className="ml-auto"
            >
              <Plus className="w-4 h-4" />
              New Order
            </Button>
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
            <Spinner variant="block" />
          ) : orders.length === 0 ? (
            <div className="text-center py-16">
              <ClipboardList className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-600">No medication orders found.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-b bg-slate-50">
                    <TableHead className="text-left py-3 px-4 font-semibold text-slate-900">Medicine</TableHead>
                    <TableHead className="text-right py-3 px-4 font-semibold text-slate-900">Qty</TableHead>
                    {canDispense && <TableHead className="text-right py-3 px-4 font-semibold text-slate-900">Total</TableHead>}
                    <TableHead className="text-left py-3 px-4 font-semibold text-slate-900">Dosage</TableHead>
                    <TableHead className="text-left py-3 px-4 font-semibold text-slate-900">Route</TableHead>
                    <TableHead className="text-left py-3 px-4 font-semibold text-slate-900">Doctor</TableHead>
                    <TableHead className="text-left py-3 px-4 font-semibold text-slate-900">Ordered</TableHead>
                    <TableHead className="text-left py-3 px-4 font-semibold text-slate-900">Status</TableHead>
                    {showActions && <TableHead className="text-right py-3 px-4 font-semibold text-slate-900">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                {grouped.map((group) => {
                  const open = openPatients.has(group.patientId);
                  const pending = group.orders.filter((o) => o.status === 'pending').length;
                  return (
                <TableBody key={group.patientId}>
                  <TableRow
                    onClick={() => togglePatient(group.patientId)}
                    className="border-b bg-slate-50/60 hover:bg-slate-100 cursor-pointer"
                  >
                    <TableCell colSpan={COLUMN_COUNT} className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <ChevronRight
                          className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-90' : ''}`}
                        />
                        <div className="min-w-0">
                          <p className="font-medium text-slate-900">{group.patientName}</p>
                          {group.patientPhone && (
                            <p className="text-xs text-slate-500">{group.patientPhone}</p>
                          )}
                        </div>
                        <span className="ml-auto text-xs text-slate-500">
                          {group.orders.length} item{group.orders.length === 1 ? '' : 's'}
                          {pending > 0 && (
                            <span className="ml-2 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold">
                              {pending} to dispense
                            </span>
                          )}
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                  {open && group.orders.map((order) => (
                    <TableRow key={order.id} className="border-b hover:bg-slate-50">
                      <TableCell className="py-3 px-4 text-slate-700 pl-11 whitespace-normal">{order.medicineName}</TableCell>
                      <TableCell className="py-3 px-4 text-right font-medium text-slate-900 tabular-nums whitespace-normal">
                        {order.quantity}
                      </TableCell>
                      {canDispense && (
                        <TableCell className="py-3 px-4 text-right tabular-nums text-slate-700 whitespace-normal">
                          {order.unitPrice > 0
                            ? formatINR(order.unitPrice * order.quantity)
                            : '—'}
                        </TableCell>
                      )}
                      <TableCell className="py-3 px-4 text-slate-600 whitespace-normal">{order.dosage}</TableCell>
                      <TableCell className="py-3 px-4 text-slate-600 whitespace-normal">{order.route}</TableCell>
                      <TableCell className="py-3 px-4 text-slate-600 whitespace-normal">
                        {order.doctorName ?? order.doctorId}
                      </TableCell>
                      <TableCell className="py-3 px-4 text-slate-500">
                        {fmtDate(order.orderedAt)}
                      </TableCell>
                      <TableCell className="py-3 px-4 whitespace-normal">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_BADGE[order.status]}`}
                        >
                          {order.status}
                        </span>
                      </TableCell>
                      {showActions && <TableCell className="py-3 px-4 text-right whitespace-normal">
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
                              onClick={() => setAdministerOrder(order)}
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
                      </TableCell>}
                    </TableRow>
                  ))}
                </TableBody>
                  );
                })}
              </Table>
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
            <Formik<NewOrderForm>
              initialValues={NEW_ORDER_INITIAL}
              validationSchema={newOrderSchema}
              onSubmit={async (values, { setSubmitting }) => {
                setFormError('');
                const payload = {
                  ...(values.appointmentId.trim() && { appointmentId: values.appointmentId.trim() }),
                  patientId: values.patientId,
                  medicineId: values.medicineId || undefined,
                  medicineName: values.medicineName.trim(),
                  quantity: Number(values.quantity),
                  dosage: values.dosage.trim(),
                  route: values.route,
                  frequency: values.frequency.trim(),
                  duration: values.duration.trim(),
                  instructions: values.instructions.trim(),
                };
                try {
                  await createOrder(payload).unwrap();
                  toast.success('Medication order created');
                  setNewOrderOpen(false);
                } catch (err) {
                  setFormError(apiError(err, 'Failed to create order'));
                } finally {
                  setSubmitting(false);
                }
              }}
            >
              {({ setFieldValue, isSubmitting, dirty }) => (
                <Form className="grid gap-4">
                  <FormField
                    name="patientId"
                    label="Patient"
                    as="select"
                    required
                    placeholder="Select patient…"
                    options={patients.map((p) => ({ value: p.id, label: p.user?.name ?? p.userId }))}
                  />

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Medicine</label>
                    <select
                      onChange={(e) => {
                        const id = e.target.value;
                        const med = medicines.find((m) => m.id === id);
                        setFieldValue('medicineId', id);
                        if (med) {
                          setFieldValue('medicineName', med.name);
                          setFieldValue('route', med.form?.toLowerCase().includes('injection') ? 'IM' : 'Oral');
                        }
                      }}
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

                  <FormField name="medicineName" label="Medicine Name" required placeholder="Or type a name manually" />

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <FormField name="quantity" label="Quantity" type="number" min="1" required />
                      <p className="text-xs text-slate-400 mt-1">Units to dispense</p>
                    </div>
                    <FormField name="dosage" label="Dosage" required placeholder="e.g. 500 mg" />
                    <FormField name="route" label="Route" as="select" required options={ROUTES.map((r) => ({ value: r, label: r }))} />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <FormField name="frequency" label="Frequency" placeholder="e.g. 8 hourly" />
                    <FormField name="duration" label="Duration" placeholder="e.g. 5 days" />
                  </div>

                  <FormField name="instructions" label="Instructions" as="textarea" rows={2} placeholder="Special instructions…" />

                  {formError && (
                    <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                      {formError}
                    </p>
                  )}

                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setNewOrderOpen(false)}
                      className="flex-1 px-4 py-2 bg-slate-200 text-slate-700 rounded hover:bg-slate-300 transition"
                    >
                      Cancel
                    </button>
                    <Button
                      type="submit"
                      disabled={isSubmitting || !dirty || isCreating}
                      variant="brand"
                      className="flex-1"
                    >
                      {isSubmitting || isCreating ? <Spinner size="sm" label="Creating…" /> : 'Create Order'}
                    </Button>
                  </div>
                </Form>
              )}
            </Formik>
          </div>
        </div>
      )}

      {/* The bill itself, offered once the payment exists. Kept as its own
          step rather than printing automatically: a print dialog firing on its
          own during a dispense is startling, and not every counter prints. */}
      {printable && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-2xl max-w-sm w-full p-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-green-50 text-green-600 flex items-center justify-center mx-auto">
              <Receipt className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Dispensed and billed</h3>
              <p className="text-sm text-slate-500 mt-1">
                Print the bill for the patient, or close and print it later from Payments.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setPrintable(null)}
                className="flex-1 px-4 py-2 bg-slate-200 text-slate-700 rounded hover:bg-slate-300 transition"
              >
                Close
              </button>
              <Button
                onClick={() => {
                  openInvoicePrint(printable);
                  setPrintable(null);
                }}
                variant="brand"
                className="flex-1"
              >
                Print bill
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Dispense & Bill Modal */}
      {billOrder && (
        <Formik<DispenseBillValues>
          initialValues={{ medicineId: billOrder.medicineId ?? '', quantity: String(billOrder.quantity ?? 1), method: 'cash' }}
          validationSchema={billOrder.status === 'pending' ? dispenseBillSchema : undefined}
          onSubmit={async (values, { setSubmitting }) => {
            try {
              if (billOrder.status === 'pending') {
                // 1. Dispense — with the counted quantity and the confirmed catalogue
                //    item, so stock moves by what was actually handed over.
                await dispenseOrder({
                  id: billOrder.id,
                  quantity: Number(values.quantity),
                  ...(values.medicineId ? { medicineId: values.medicineId } : {}),
                }).unwrap();
                // 2. Bill (creates Payment record)
                const bill = await billMedicationOrder({
                  id: billOrder.id, paymentMethod: values.method,
                }).unwrap();
                toast.success('Order dispensed and billed');
                setBillOrder(null);
                setPrintable(bill.payment.id);
              } else {
                await billMedicationOrder({ id: billOrder.id, paymentMethod: values.method }).unwrap();
                toast.success('Order billed');
                setBillOrder(null);
              }
            } catch (err) {
              toast.error(apiError(err, billOrder.status === 'pending' ? 'Failed to dispense/bill order' : 'Failed to bill order'));
            } finally {
              setSubmitting(false);
            }
          }}
        >
          {({ values, setFieldValue, isSubmitting }) => {
            const billedMedicine = medicines.find((m) => m.id === values.medicineId);
            const billedQuantity = Math.max(1, Number(values.quantity) || 0);
            const billedUnitPrice = billedMedicine?.price ?? billOrder.unitPrice ?? 0;
            const billedTotal = billedUnitPrice * billedQuantity;
            return (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
                <div className="bg-white rounded-lg shadow-2xl max-w-md w-full p-6">
                  <Form>
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-lg font-bold text-slate-900">Dispense &amp; Bill</h3>
                      <button type="button" onClick={() => setBillOrder(null)} className="text-slate-500 hover:text-slate-900" disabled={isSubmitting}>
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
                        <span className="text-slate-500">Prescribed</span>
                        <span className="font-medium text-slate-900">{billOrder.medicineName}</span>
                      </div>
                      {(billOrder.dosage || billOrder.frequency || billOrder.duration) && (
                        <div className="flex justify-between">
                          <span className="text-slate-500">Directions</span>
                          <span className="text-slate-700 text-right">
                            {[billOrder.dosage, billOrder.frequency, billOrder.duration].filter(Boolean).join(' · ')}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* What is actually handed over. Editable while the order is still
                        pending: a prescription records the dose, never the count, and
                        its medicine is free text that may not name anything stocked. */}
                    {billOrder.status === 'pending' ? (
                      <div className="space-y-3 mb-4">
                        <div>
                          <FormField
                            name="medicineId"
                            label="Dispensing from stock"
                            as="select"
                            placeholder="Not stocked — bill without moving inventory"
                            options={medicines.map((m) => ({
                              value: m.id,
                              label: `${[m.name, m.strength, m.form].filter(Boolean).join(' · ')} (${m.stock} left)`,
                            }))}
                          />
                          {!values.medicineId && (
                            <p className="text-xs text-amber-600 mt-1">
                              Nothing will be deducted from stock.
                            </p>
                          )}
                        </div>
                        <div>
                          <FormField name="quantity" label="Quantity handed over" type="number" min="1" />
                          {billedMedicine && billedQuantity > (billedMedicine.stock ?? 0) && (
                            <p className="text-xs text-red-600 mt-1">
                              Only {billedMedicine.stock} in stock — dispensing will be refused.
                            </p>
                          )}
                        </div>
                        <div className="bg-slate-50 rounded-lg p-3 text-sm space-y-1">
                          <div className="flex justify-between">
                            <span className="text-slate-500">Unit price</span>
                            <span className="text-slate-900">{formatINR(billedUnitPrice)}</span>
                          </div>
                          <div className="flex justify-between border-t pt-2">
                            <span className="font-semibold text-slate-900">Total</span>
                            <span className="font-bold text-lg text-cyan-700">{formatINR(billedTotal)}</span>
                          </div>
                          {billedUnitPrice === 0 && (
                            <p className="text-xs text-amber-600">
                              No catalogue price — the bill records ₹0.
                            </p>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="bg-slate-50 rounded-lg p-4 mb-4 space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span className="text-slate-500">Quantity</span>
                          <span className="font-medium text-slate-900">{billOrder.quantity}</span>
                        </div>
                        <div className="flex justify-between border-t pt-2 mt-2">
                          <span className="font-semibold text-slate-900">Total</span>
                          <span className="font-bold text-lg text-cyan-700">
                            {formatINR((billOrder.unitPrice ?? 0) * (billOrder.quantity ?? 1))}
                          </span>
                        </div>
                      </div>
                    )}

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
                            type="button"
                            onClick={() => setFieldValue('method', m.value)}
                            className={`flex-1 py-2 rounded-lg border text-sm font-medium transition ${
                              values.method === m.value
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
                        type="button"
                        onClick={() => setBillOrder(null)}
                        disabled={isSubmitting}
                        className="flex-1 px-4 py-2 bg-slate-200 text-slate-700 rounded hover:bg-slate-300 transition disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      <Button
                        type="submit"
                        disabled={isSubmitting}
                        variant="brand"
                        className="flex-1"
                      >
                        {isSubmitting
                          ? 'Processing…'
                          : billOrder.status === 'pending'
                          ? 'Dispense & Bill'
                          : 'Bill'}
                      </Button>
                    </div>
                  </Form>
                </div>
              </div>
            );
          }}
        </Formik>
      )}

      {/* Administer Modal */}
      {administerOrder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-2xl max-w-md w-full p-6">
            <Formik<AdministerValues>
              initialValues={{ site: '', notes: '' }}
              validationSchema={Yup.object({
                site: ['IV', 'IM', 'SC'].includes(administerOrder.route)
                  ? Yup.string().trim().required('Please enter the injection site (e.g. Left arm, IV line A)')
                  : Yup.string(),
              })}
              onSubmit={async (values, { setSubmitting }) => {
                try {
                  await administerOrderMut({ id: administerOrder.id, notes: values.notes, site: values.site }).unwrap();
                  toast.success('Order marked as administered');
                  setAdministerOrder(null);
                } catch (err) {
                  toast.error(apiError(err, 'Failed to administer order'));
                } finally {
                  setSubmitting(false);
                }
              }}
            >
              {({ isSubmitting, dirty }) => (
                <Form>
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold text-slate-900">Record Administration</h3>
                    <button type="button" onClick={() => setAdministerOrder(null)} className="text-slate-500 hover:text-slate-900">
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
                      <FormField name="site" label="Injection Site" required placeholder="e.g. Left arm, Right deltoid, IV line A" />
                    )}
                    <FormField name="notes" label="Notes (optional)" as="textarea" rows={2} placeholder="e.g. Patient tolerated well, no adverse reaction…" />
                  </div>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setAdministerOrder(null)}
                      className="flex-1 px-4 py-2 bg-slate-200 text-slate-700 rounded hover:bg-slate-300 transition"
                    >
                      Cancel
                    </button>
                    <Button
                      type="submit"
                      // Notes-only submission is a legitimate no-touch click (nothing
                      // to fill in); a required injection site is not, so that route
                      // still needs a real edit before Mark Administered lights up.
                      disabled={isSubmitting || (['IV', 'IM', 'SC'].includes(administerOrder.route) && !dirty)}
                      variant="brand"
                      className="flex-1"
                    >
                      {isSubmitting ? <Spinner size="sm" label="Saving…" /> : 'Mark Administered'}
                    </Button>
                  </div>
                </Form>
              )}
            </Formik>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
