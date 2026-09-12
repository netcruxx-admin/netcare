'use client';

import { useState } from 'react';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import { Plus, Syringe } from 'lucide-react';
import { apiError } from '@/lib/apiError';
import { Spinner } from '@/components/ui/spinner';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { useCancelInjectionOrderMutation, useCreateInjectionOrderMutation, useListInjectablesQuery } from '@/store/api';
import { INJECTION_ROUTES, type InjectionOrder } from '@/lib/types';
import { InlineConfirmBar } from './InlineConfirm';

const schema = Yup.object({
  injectableName: Yup.string().trim().required('Name the injectable'),
  dose: Yup.string().trim().max(40, 'Too long'),
  route: Yup.string().required('Select a route'),
  quantity: Yup.number()
    .transform((v, o) => (o === '' ? undefined : v))
    .typeError('Enter a number')
    .integer('Whole number')
    .min(1, 'At least 1')
    .required('Quantity is required'),
  scheduledFor: Yup.string(),
  instructions: Yup.string().trim().max(300, 'Too long'),
});

const STATUS_CLS: Record<string, string> = {
  ordered: 'bg-blue-100 text-blue-700',
  administered: 'bg-green-100 text-green-700',
  cancelled: 'bg-slate-100 text-slate-500',
};

const cell = 'w-full px-2 py-1.5 border border-slate-300 rounded text-sm focus:outline-none focus:border-cyan-500 bg-white';

const HEAD = ['Injectable', 'Dose', 'Route', 'Qty', 'Scheduled', 'Instructions'];

interface Props {
  orders: InjectionOrder[];
  appointmentId: string;
  patientId: string;
  doctorId: string;
  canManage: boolean;
}

export function InjectionOrdersSection({ orders, appointmentId, patientId, doctorId, canManage }: Props) {
  const [createInjectionOrder] = useCreateInjectionOrderMutation();
  const [cancelInjectionOrder] = useCancelInjectionOrderMutation();
  const { data: injectables = [] } = useListInjectablesQuery(undefined, { skip: !canManage });
  const [addError, setAddError] = useState('');
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  if (!canManage && orders.length === 0) return null;

  const colSpan = HEAD.length + 1;

  const confirmCancel = async () => {
    if (!cancelId) return;
    setCancelling(true);
    try {
      await cancelInjectionOrder(cancelId).unwrap();
      setCancelId(null);
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Syringe className="w-5 h-5 text-slate-500" />
        <h2 className="text-base font-semibold text-slate-900">Injections</h2>
        <span className="text-xs text-slate-400 font-normal">({orders.length})</span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-100">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50 border-b border-slate-100">
              {[...HEAD, 'Status'].map((h) => (
                <TableHead key={h} className="py-2.5 px-4 text-left text-xs font-semibold text-slate-500">{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody className="bg-white">
            {orders.map((order) =>
              cancelId === order.id ? (
                <TableRow key={order.id}>
                  <TableCell colSpan={colSpan} className="p-3">
                    <InlineConfirmBar
                      message="Cancel this injection order?"
                      confirmLabel="Cancel Order"
                      tone="bg-amber-600 hover:bg-amber-700"
                      loading={cancelling}
                      onConfirm={confirmCancel}
                      onCancel={() => setCancelId(null)}
                    />
                  </TableCell>
                </TableRow>
              ) : (
                <TableRow key={order.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <TableCell className="py-3 px-4 font-medium text-slate-900 whitespace-normal">{order.injectableName}</TableCell>
                  <TableCell className="py-3 px-4 text-slate-600 whitespace-normal">{order.dose || '—'}</TableCell>
                  <TableCell className="py-3 px-4 text-slate-600 whitespace-normal">{order.route}</TableCell>
                  <TableCell className="py-3 px-4 text-slate-600 whitespace-normal">{order.quantity}</TableCell>
                  <TableCell className="py-3 px-4 text-slate-600 whitespace-normal">{order.scheduledFor || '—'}</TableCell>
                  <TableCell className="py-3 px-4 text-slate-500 whitespace-normal">{order.instructions || '—'}</TableCell>
                  <TableCell className="py-3 px-4">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_CLS[order.status] ?? 'bg-slate-100 text-slate-700'}`}>
                      {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                    </span>
                    {canManage && order.status === 'ordered' && (
                      <button onClick={() => setCancelId(order.id)} className="ml-2 text-xs font-semibold text-amber-700 hover:text-amber-800">
                        Cancel
                      </button>
                    )}
                  </TableCell>
                </TableRow>
              ),
            )}
            {canManage && (
              <NewInjectionRow
                injectables={injectables}
                colSpan={colSpan}
                onAdd={async (body) => {
                  setAddError('');
                  try {
                    await createInjectionOrder({ appointmentId, patientId, doctorId, ...body }).unwrap();
                  } catch (err) {
                    setAddError(apiError(err, 'Could not order injection'));
                    throw err;
                  }
                }}
              />
            )}
          </TableBody>
        </Table>
      </div>
      {addError && (
        <p className="mt-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{addError}</p>
      )}
    </div>
  );
}

// The catalogue quick-fill lives on one input via a datalist: type or pick a
// stocked name and dose/route come along; type anything else for a one-off.
function NewInjectionRow({
  injectables,
  colSpan,
  onAdd,
}: {
  injectables: { id: string; name: string; strength: string; route: string; stock: number }[];
  colSpan: number;
  onAdd: (body: {
    injectableId?: string;
    injectableName: string;
    dose: string;
    route: string;
    quantity: number;
    scheduledFor?: string;
    instructions?: string;
  }) => Promise<void>;
}) {
  const formik = useFormik({
    initialValues: { injectableName: '', dose: '', route: 'IM', quantity: '1', scheduledFor: '', instructions: '' },
    validationSchema: schema,
    validateOnBlur: false,
    validateOnChange: false,
    onSubmit: async (values, { resetForm, setSubmitting }) => {
      try {
        const match = injectables.find((i) => i.name === values.injectableName);
        await onAdd({
          injectableId: match?.id,
          injectableName: values.injectableName.trim(),
          dose: values.dose.trim(),
          route: values.route,
          quantity: Number(values.quantity),
          scheduledFor: values.scheduledFor || undefined,
          instructions: values.instructions.trim() || undefined,
        });
        resetForm();
      } catch {
        // surfaced by the caller
      } finally {
        setSubmitting(false);
      }
    },
  });

  const err = Object.values(formik.errors)[0];

  const onInjectableChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    formik.handleChange(e);
    const match = injectables.find((i) => i.name === e.target.value);
    if (match) {
      if (match.strength) formik.setFieldValue('dose', match.strength);
      if (match.route) formik.setFieldValue('route', match.route);
    }
  };

  return (
    <>
      <TableRow className="bg-cyan-50/20">
        <TableCell className="p-1.5">
          <input
            list="injectables-catalogue"
            name="injectableName"
            value={formik.values.injectableName}
            onChange={onInjectableChange}
            placeholder="e.g. Tetanus toxoid"
            className={cell}
          />
          <datalist id="injectables-catalogue">
            {injectables.map((i) => (
              <option key={i.id} value={i.name}>{`${i.strength ? `${i.strength} · ` : ''}${i.stock} in stock`}</option>
            ))}
          </datalist>
        </TableCell>
        <TableCell className="p-1.5">
          <input name="dose" value={formik.values.dose} onChange={formik.handleChange} placeholder="0.5 mL" className={cell} />
        </TableCell>
        <TableCell className="p-1.5">
          <select name="route" value={formik.values.route} onChange={formik.handleChange} className={cell}>
            {INJECTION_ROUTES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </TableCell>
        <TableCell className="p-1.5">
          <input name="quantity" type="number" min="1" value={formik.values.quantity} onChange={formik.handleChange} className={`${cell} w-16`} />
        </TableCell>
        <TableCell className="p-1.5">
          <input name="scheduledFor" type="date" value={formik.values.scheduledFor} onChange={formik.handleChange} className={cell} />
        </TableCell>
        <TableCell className="p-1.5">
          <input name="instructions" value={formik.values.instructions} onChange={formik.handleChange} placeholder="Observe 15 min" className={cell} />
        </TableCell>
        <TableCell className="p-1.5">
          <button
            type="button"
            onClick={() => formik.submitForm()}
            disabled={formik.isSubmitting || !formik.dirty}
            title="Order injection"
            className="p-1.5 text-cyan-600 hover:text-cyan-700 hover:bg-cyan-50 rounded transition disabled:opacity-50"
          >
            {formik.isSubmitting ? <Spinner size="sm" /> : <Plus className="w-4 h-4" />}
          </button>
        </TableCell>
      </TableRow>
      {err && (
        <TableRow>
          <TableCell colSpan={colSpan} className="px-2 pb-2">
            <p className="text-xs text-red-600">{err}</p>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
