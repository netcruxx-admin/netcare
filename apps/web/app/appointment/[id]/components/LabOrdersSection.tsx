'use client';

import { Fragment, useState } from 'react';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import { FlaskConical, Plus, Trash2 } from 'lucide-react';
import { apiError } from '@/lib/apiError';
import { Spinner } from '@/components/ui/spinner';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { useCancelTestOrderMutation, useCreateTestOrderMutation, useListLabTestsQuery } from '@/store/api';
import { InlineConfirmBar } from './InlineConfirm';

const ORDER_STATUS: Record<string, { label: string; cls: string }> = {
  ordered: { label: 'Ordered', cls: 'bg-blue-100 text-blue-700' },
  sample_collected: { label: 'Sample Collected', cls: 'bg-amber-100 text-amber-700' },
  in_progress: { label: 'In Progress', cls: 'bg-amber-100 text-amber-700' },
  completed: { label: 'Completed', cls: 'bg-green-100 text-green-700' },
  reviewed: { label: 'Reviewed', cls: 'bg-green-100 text-green-700' },
};

const RESULT_FLAG: Record<string, string> = {
  normal: 'text-slate-700',
  low: 'text-amber-600',
  high: 'text-amber-600',
  critical: 'text-red-600 font-semibold',
};

const HEAD = ['Test', 'Priority', 'Note', 'Status'];

const cell = 'w-full px-2 py-1.5 border border-slate-300 rounded text-sm focus:outline-none focus:border-cyan-500 bg-white';

const schema = Yup.object({
  testId: Yup.string().required('Select a test'),
  priority: Yup.string().required(),
  clinicalNote: Yup.string(),
});

interface Props {
  testOrders: any[];
  appointmentId: string;
  patientId: string;
  doctorId: string;
  canOrder: boolean;
  canDelete: boolean;
}

export function LabOrdersSection({ testOrders, appointmentId, patientId, doctorId, canOrder, canDelete }: Props) {
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelTestOrder] = useCancelTestOrderMutation();
  const [createTestOrder] = useCreateTestOrderMutation();
  const { data: tests = [] } = useListLabTestsQuery(undefined, { skip: !canOrder });
  const [addError, setAddError] = useState('');

  if (!canOrder && testOrders.length === 0) return null;

  const colSpan = HEAD.length + (canDelete ? 1 : 0);

  const confirmCancel = async () => {
    if (!cancelId) return;
    setCancelling(true);
    try {
      await cancelTestOrder(cancelId).unwrap();
      setCancelId(null);
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <FlaskConical className="w-5 h-5 text-slate-500" />
        <h2 className="text-base font-semibold text-slate-900">Lab / Test Orders</h2>
        <span className="text-xs text-slate-400 font-normal">({testOrders.length})</span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-100">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50 border-b border-slate-100">
              {[...HEAD, ...(canDelete ? ['Actions'] : [])].map((h) => (
                <TableHead key={h} className="py-2.5 px-4 text-left text-xs font-semibold text-slate-500">{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody className="bg-white">
            {testOrders.map((order) => {
              const statusInfo = ORDER_STATUS[order.status] ?? { label: order.status, cls: 'bg-slate-100 text-slate-700' };
              return (
                <Fragment key={order.id}>
                  <TableRow className="border-b border-slate-50 hover:bg-slate-50">
                    <TableCell className="py-3 px-4 whitespace-normal">
                      <div className="flex flex-wrap gap-1.5">
                        {order.items?.map((item: any) => (
                          <span key={item.testId} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-cyan-50 text-cyan-800 border border-cyan-100">
                            {item.name}
                          </span>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="py-3 px-4 whitespace-normal">
                      {order.priority === 'urgent' ? (
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">Urgent</span>
                      ) : (
                        <span className="text-slate-500 text-xs">Routine</span>
                      )}
                    </TableCell>
                    <TableCell className="py-3 px-4 text-slate-500 max-w-xs whitespace-normal">{order.clinicalNote || '—'}</TableCell>
                    <TableCell className="py-3 px-4 whitespace-normal">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${statusInfo.cls}`}>{statusInfo.label}</span>
                    </TableCell>
                    {canDelete && (
                      <TableCell className="py-2 px-3">
                        <button
                          onClick={() => setCancelId(order.id)}
                          title="Cancel order"
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </TableCell>
                    )}
                  </TableRow>
                  {cancelId === order.id && (
                    <TableRow className="border-b border-slate-50">
                      <TableCell colSpan={colSpan} className="p-3">
                        <InlineConfirmBar
                          message="Cancel this lab order? If the lab has already started processing it, cancellation will be blocked."
                          confirmLabel="Cancel Order"
                          tone="bg-amber-600 hover:bg-amber-700"
                          loading={cancelling}
                          onConfirm={confirmCancel}
                          onCancel={() => setCancelId(null)}
                        />
                      </TableCell>
                    </TableRow>
                  )}
                  {order.results?.length > 0 && (
                    <TableRow className="border-b border-slate-50 bg-slate-50/50">
                      <TableCell colSpan={colSpan} className="px-4 py-3 space-y-3 whitespace-normal">
                        {order.results.map((result: any) => (
                          <div key={result.id}>
                            <p className="text-sm font-semibold text-slate-900 mb-1">{result.testName}</p>
                            <ul className="space-y-1">
                              {result.parameters?.map((p: any, idx: number) => (
                                <li key={idx} className="text-sm flex flex-wrap gap-x-2">
                                  <span className="text-slate-600">{p.name}:</span>
                                  <span className={RESULT_FLAG[p.flag] ?? 'text-slate-700'}>{p.value} {p.unit}</span>
                                  <span className="text-slate-400">(ref {p.referenceRange})</span>
                                </li>
                              ))}
                            </ul>
                            {result.remarks && <p className="text-sm text-slate-600 mt-1">{result.remarks}</p>}
                          </div>
                        ))}
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
            {canOrder && (
              <NewTestOrderRow
                tests={tests}
                colSpan={colSpan}
                onAdd={async (body) => {
                  setAddError('');
                  try {
                    await createTestOrder({ appointmentId, patientId, doctorId, status: 'ordered', ...body }).unwrap();
                  } catch (err) {
                    setAddError(apiError(err, 'Could not place the order'));
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

// One row, one test, same pattern as the Prescriptions add-row: pick from the
// catalogue and hit add — no separate picker to open first. A doctor wanting
// a panel just adds each test as its own row.
function NewTestOrderRow({
  tests,
  colSpan,
  onAdd,
}: {
  tests: { id: string; name: string; category: string; price: number }[];
  colSpan: number;
  onAdd: (body: { items: { testId: string; name: string; price: number }[]; priority: 'routine' | 'urgent'; clinicalNote: string }) => Promise<void>;
}) {
  const formik = useFormik({
    initialValues: { testId: '', priority: 'routine', clinicalNote: '' },
    validationSchema: schema,
    validateOnBlur: false,
    validateOnChange: false,
    onSubmit: async (values, { resetForm, setSubmitting }) => {
      try {
        const test = tests.find((t) => t.id === values.testId);
        if (!test) return;
        await onAdd({
          items: [{ testId: test.id, name: test.name, price: test.price }],
          priority: values.priority as 'routine' | 'urgent',
          clinicalNote: values.clinicalNote.trim(),
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

  return (
    <>
      <TableRow className="bg-cyan-50/20">
        <TableCell className="p-1.5">
          <select name="testId" value={formik.values.testId} onChange={formik.handleChange} className={cell}>
            <option value="">Select test…</option>
            {tests.map((t) => (
              <option key={t.id} value={t.id}>{t.name} — {t.category} (₹{t.price})</option>
            ))}
          </select>
        </TableCell>
        <TableCell className="p-1.5">
          <select name="priority" value={formik.values.priority} onChange={formik.handleChange} className={cell}>
            <option value="routine">Routine</option>
            <option value="urgent">Urgent</option>
          </select>
        </TableCell>
        <TableCell className="p-1.5">
          <input name="clinicalNote" value={formik.values.clinicalNote} onChange={formik.handleChange} placeholder="Reason / clinical context" className={cell} />
        </TableCell>
        <TableCell className="p-1.5 text-slate-400 text-xs">—</TableCell>
        <TableCell className="p-1.5">
          <button
            type="button"
            onClick={() => formik.submitForm()}
            disabled={formik.isSubmitting || !formik.dirty}
            title="Order test"
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
