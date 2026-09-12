'use client';

import { useMemo, useState } from 'react';
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import { toast } from 'sonner';
import { Syringe, Plus, X, Search, AlertTriangle } from 'lucide-react';
import { apiError } from '@/lib/apiError';
import type { InjectionOrder, InjectionOrderStatus } from '@/lib/types';
import { INJECTION_ROUTES } from '@/lib/types';
import { DashboardShell } from '@/components/DashboardShell';
import { FormField } from '@/components/form/FormField';
import type { RoleViewProps } from '@/components/RoleView';
import { hasPermission } from '@/lib/auth';
import {
  useListInjectionOrdersQuery,
  useCreateInjectionOrderMutation,
  useAdministerInjectionOrderMutation,
  useCancelInjectionOrderMutation,
  useListInjectablesQuery,
  useListPatientsQuery,
} from '@/store/api';
import { doctorRole, nurseRole, pharmacistRole } from '@/lib/roles';
import { fmtDate } from '@/lib/date';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

type StatusTab = 'all' | InjectionOrderStatus;

const STATUS_TABS: { value: StatusTab; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'ordered', label: 'Ordered' },
  { value: 'administered', label: 'Administered' },
  { value: 'cancelled', label: 'Cancelled' },
];

const STATUS_BADGE: Record<InjectionOrderStatus, string> = {
  ordered: 'bg-amber-100 text-amber-700',
  administered: 'bg-green-100 text-green-700',
  cancelled: 'bg-slate-100 text-slate-500',
};

const TITLE_BY_ROLE: Record<string, string> = {
  [doctorRole]: 'My Injection Orders',
  [nurseRole]: 'Shots to Administer',
  [pharmacistRole]: 'Injection Orders',
};

const SUBTITLE_BY_ROLE: Record<string, string> = {
  [doctorRole]: 'Injections you have ordered for patients',
  [nurseRole]: 'Ordered shots waiting to be given',
  [pharmacistRole]: 'Every injection ordered across the hospital',
};

interface NewOrderForm {
  patientId: string;
  injectableId: string;
  injectableName: string;
  dose: string;
  route: string;
  quantity: string;
  scheduledFor: string;
  instructions: string;
}

const EMPTY_FORM: NewOrderForm = {
  patientId: '',
  injectableId: '',
  injectableName: '',
  dose: '',
  route: 'IM',
  quantity: '1',
  scheduledFor: '',
  instructions: '',
};

const orderSchema = Yup.object({
  patientId: Yup.string().required('Select a patient'),
  injectableName: Yup.string().trim().required('Name the injectable'),
  route: Yup.string().required('Select a route'),
  quantity: Yup.string().test('qty', 'Quantity must be a whole number of at least 1', (v) => {
    const n = Number(v);
    return Number.isInteger(n) && n >= 1;
  }),
});

interface GiveForm {
  site: string;
  quantity: string;
  notes: string;
}

const giveSchema = Yup.object({
  site: Yup.string().trim().required('Record the injection site (e.g. Left deltoid, IV line A)'),
  quantity: Yup.string().test('qty', 'Quantity must be a whole number of at least 1', (v) => {
    const n = Number(v);
    return Number.isInteger(n) && n >= 1;
  }),
});

export function InjectionOrders({ session }: RoleViewProps) {
  const role = session.user.role;
  const [activeTab, setActiveTab] = useState<StatusTab>('all');
  const [search, setSearch] = useState('');
  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const [formError, setFormError] = useState('');

  const [giving, setGiving] = useState<InjectionOrder | null>(null);

  const canOrder = hasPermission(session, 'injection_orders.manage');
  const canAdminister = hasPermission(session, 'injection_orders.administer');

  const queryArgs = {
    ...(activeTab !== 'all' && { status: activeTab }),
    ...(search.trim() && { q: search.trim() }),
  };
  const { data: orders = [], isLoading } = useListInjectionOrdersQuery(
    Object.keys(queryArgs).length ? queryArgs : undefined,
  );
  const { data: injectables = [] } = useListInjectablesQuery(undefined, { skip: !canOrder });
  const { data: patients = [] } = useListPatientsQuery(undefined, { skip: !canOrder });

  const [createOrder, { isLoading: isCreating }] = useCreateInjectionOrderMutation();
  const [administerOrder, { isLoading: isGiving }] = useAdministerInjectionOrderMutation();
  const [cancelOrder] = useCancelInjectionOrderMutation();

  const sorted = useMemo(
    () => [...orders].sort((a, b) => (a.orderedAt < b.orderedAt ? 1 : -1)),
    [orders],
  );

  const openGive = (order: InjectionOrder) => {
    setGiving(order);
  };

  const handleCancel = async (id: string) => {
    try {
      await cancelOrder(id).unwrap();
      toast.success('Order cancelled');
    } catch (err) {
      toast.error(apiError(err, 'Failed to cancel order'));
    }
  };

  const showActions =
    (canOrder && role === doctorRole) || canAdminister;
  const shortStock = (o: InjectionOrder) =>
    o.status === 'ordered' &&
    o.injectableId != null &&
    o.stockOnHand != null &&
    o.stockOnHand < o.quantity;

  return (
    <DashboardShell
      role={role}
      userName={session.user.name}
      title={TITLE_BY_ROLE[role] ?? 'Injection Orders'}
      subtitle={SUBTITLE_BY_ROLE[role] ?? 'Injections ordered for patients'}
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

          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search patient or injectable…"
              className="w-full pl-9 pr-3 py-1.5 bg-white rounded-lg shadow text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>

          {canOrder && role === doctorRole && (
            <Button
              onClick={() => { setFormError(''); setNewOrderOpen(true); }}
              variant="brand"
              size="sm"
              className="ml-auto"
            >
              <Plus className="w-4 h-4" />
              New Injection Order
            </Button>
          )}
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b">
            <h3 className="font-semibold text-slate-900">Injection Orders ({sorted.length})</h3>
          </div>

          {isLoading ? (
            <Spinner variant="block" />
          ) : sorted.length === 0 ? (
            <div className="text-center py-16">
              <Syringe className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-600">No injection orders found.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-b bg-slate-50">
                    <TableHead className="text-left py-3 px-4 font-semibold text-slate-900">Patient</TableHead>
                    <TableHead className="text-left py-3 px-4 font-semibold text-slate-900">Injectable</TableHead>
                    <TableHead className="text-left py-3 px-4 font-semibold text-slate-900">Dose</TableHead>
                    <TableHead className="text-left py-3 px-4 font-semibold text-slate-900">Route</TableHead>
                    <TableHead className="text-right py-3 px-4 font-semibold text-slate-900">Qty</TableHead>
                    <TableHead className="text-left py-3 px-4 font-semibold text-slate-900">Doctor</TableHead>
                    <TableHead className="text-left py-3 px-4 font-semibold text-slate-900">Ordered</TableHead>
                    <TableHead className="text-left py-3 px-4 font-semibold text-slate-900">Status</TableHead>
                    {showActions && <TableHead className="text-right py-3 px-4 font-semibold text-slate-900">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map((order) => (
                    <TableRow key={order.id} className="border-b hover:bg-slate-50">
                      <TableCell className="py-3 px-4 whitespace-normal">
                        <p className="font-medium text-slate-900">{order.patientName ?? order.patientId}</p>
                        {order.patientPhone && <p className="text-xs text-slate-500">{order.patientPhone}</p>}
                      </TableCell>
                      <TableCell className="py-3 px-4 text-slate-700 whitespace-normal">
                        {order.injectableName}
                        {shortStock(order) && (
                          <span className="ml-2 inline-flex items-center gap-1 text-xs text-red-600 font-medium">
                            <AlertTriangle className="w-3 h-3" />
                            {order.stockOnHand} in stock
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="py-3 px-4 text-slate-600 whitespace-normal">{order.dose || '—'}</TableCell>
                      <TableCell className="py-3 px-4 text-slate-600 whitespace-normal">{order.route}</TableCell>
                      <TableCell className="py-3 px-4 text-right tabular-nums font-medium text-slate-900 whitespace-normal">{order.quantity}</TableCell>
                      <TableCell className="py-3 px-4 text-slate-600 whitespace-normal">{order.doctorName ?? order.doctorId}</TableCell>
                      <TableCell className="py-3 px-4 text-slate-500">{fmtDate(order.orderedAt)}</TableCell>
                      <TableCell className="py-3 px-4 whitespace-normal">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_BADGE[order.status]}`}>
                          {order.status}
                        </span>
                      </TableCell>
                      {showActions && (
                        <TableCell className="py-3 px-4 text-right whitespace-normal">
                          <div className="flex items-center justify-end gap-2">
                            {canAdminister && order.status === 'ordered' && (
                              <button
                                onClick={() => openGive(order)}
                                className="px-2 py-1 text-xs font-medium bg-green-50 text-green-700 rounded hover:bg-green-100 transition"
                              >
                                Administer
                              </button>
                            )}
                            {canOrder && role === doctorRole && order.status === 'ordered' && (
                              <button
                                onClick={() => handleCancel(order.id)}
                                className="px-2 py-1 text-xs font-medium bg-red-50 text-red-700 rounded hover:bg-red-100 transition"
                              >
                                Cancel
                              </button>
                            )}
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
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
              <h3 className="text-lg font-bold text-slate-900">New Injection Order</h3>
              <button onClick={() => setNewOrderOpen(false)} className="text-slate-500 hover:text-slate-900">
                <X className="w-5 h-5" />
              </button>
            </div>
            <Formik<NewOrderForm>
              initialValues={EMPTY_FORM}
              validationSchema={orderSchema}
              onSubmit={async (values, { setSubmitting }) => {
                setFormError('');
                try {
                  await createOrder({
                    patientId: values.patientId,
                    injectableId: values.injectableId || undefined,
                    injectableName: values.injectableName.trim(),
                    dose: values.dose.trim(),
                    route: values.route,
                    quantity: Number(values.quantity),
                    scheduledFor: values.scheduledFor || undefined,
                    instructions: values.instructions.trim() || undefined,
                  }).unwrap();
                  toast.success('Injection ordered');
                  setNewOrderOpen(false);
                } catch (err) {
                  setFormError(apiError(err, 'Failed to order injection'));
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
                    <label className="block text-sm font-medium text-slate-700 mb-1">From catalogue</label>
                    <select
                      onChange={(e) => {
                        const id = e.target.value;
                        const item = injectables.find((i) => i.id === id);
                        setFieldValue('injectableId', id);
                        if (item) {
                          setFieldValue('injectableName', item.name);
                          if (item.strength) setFieldValue('dose', item.strength);
                          if (item.route) setFieldValue('route', item.route);
                        }
                      }}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    >
                      <option value="">Not stocked — enter a name below</option>
                      {injectables.map((i) => (
                        <option key={i.id} value={i.id}>
                          {[i.name, i.strength, i.form].filter(Boolean).join(' · ')} ({i.stock} in stock)
                        </option>
                      ))}
                    </select>
                  </div>

                  <FormField
                    name="injectableName"
                    label="Injectable name"
                    required
                    placeholder="e.g. Tetanus toxoid"
                    onValueChange={() => setFieldValue('injectableId', '')}
                  />

                  <div className="grid grid-cols-3 gap-3">
                    <FormField name="dose" label="Dose" placeholder="e.g. 0.5 mL" />
                    <FormField name="route" label="Route" as="select" required options={INJECTION_ROUTES.map((r) => ({ value: r, label: r }))} />
                    <div>
                      <FormField name="quantity" label="Qty" type="number" min="1" required />
                      <p className="text-xs text-slate-400 mt-1">Vials used</p>
                    </div>
                  </div>

                  <FormField name="scheduledFor" label="Scheduled for" type="date" />
                  <FormField name="instructions" label="Instructions" as="textarea" rows={2} placeholder="Special instructions…" />

                  {formError && (
                    <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{formError}</p>
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
                      {isSubmitting || isCreating ? <Spinner size="sm" label="Ordering…" /> : 'Order Injection'}
                    </Button>
                  </div>
                </Form>
              )}
            </Formik>
          </div>
        </div>
      )}

      {/* Administer Modal */}
      {giving && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-2xl max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-slate-900">Record Administration</h3>
              <button onClick={() => setGiving(null)} className="text-slate-500 hover:text-slate-900">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-slate-600 mb-4">
              Giving <span className="font-semibold">{giving.injectableName}</span>{' '}
              {giving.dose && <>{giving.dose} </>}
              <span className="font-medium text-slate-700">({giving.route})</span> to{' '}
              <span className="font-semibold">{giving.patientName ?? giving.patientId}</span>.
            </p>
            <Formik<GiveForm>
              initialValues={{ site: '', quantity: String(giving.quantity), notes: '' }}
              validationSchema={giveSchema}
              onSubmit={async (values, { setSubmitting }) => {
                try {
                  await administerOrder({
                    id: giving.id,
                    site: values.site.trim(),
                    notes: values.notes.trim() || undefined,
                    quantity: Number(values.quantity),
                  }).unwrap();
                  toast.success('Shot marked as given');
                  setGiving(null);
                } catch (err) {
                  toast.error(apiError(err, 'Failed to record administration'));
                } finally {
                  setSubmitting(false);
                }
              }}
            >
              {({ isSubmitting, dirty }) => (
                <Form>
                  <div className="grid gap-3 mb-4">
                    <FormField name="site" label="Injection site" required placeholder="e.g. Left deltoid, Right thigh, IV line A" autoFocus />
                    <div>
                      <FormField name="quantity" label="Vials used" type="number" min="1" />
                      {giving.injectableId != null && giving.stockOnHand != null && (
                        <p className="text-xs text-slate-400 mt-1">{giving.stockOnHand} in stock</p>
                      )}
                    </div>
                    <FormField name="notes" label="Notes (optional)" as="textarea" rows={2} placeholder="e.g. Tolerated well, no adverse reaction…" />
                  </div>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setGiving(null)}
                      className="flex-1 px-4 py-2 bg-slate-200 text-slate-700 rounded hover:bg-slate-300 transition"
                    >
                      Cancel
                    </button>
                    <Button
                      type="submit"
                      disabled={isSubmitting || !dirty || isGiving}
                      variant="brand"
                      className="flex-1"
                    >
                      {isSubmitting || isGiving ? <Spinner size="sm" label="Saving…" /> : 'Mark Given'}
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
