'use client';

import { useState } from 'react';
import { Formik, Form, FormikProvider, useFormik } from 'formik';
import { FileText, Pencil, Plus, Trash2 } from 'lucide-react';
import { apiError } from '@/lib/apiError';
import { fmtDate } from '@/lib/date';
import { Spinner } from '@/components/ui/spinner';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { useCreateVitalsMutation, useDeleteVitalsMutation, useUpdateVitalsMutation } from '@/store/api';
import {
  Autofill,
  VitalsFormFields,
  emptyVitals,
  pregnancyStatusOptions,
  vitalsSchema,
  vitalsToForm,
  vitalsToPayload,
} from '@/components/vitals/vitalsForm';
import type { Vitals } from '@/lib/types';
import { InlineConfirmBar } from './InlineConfirm';

const HEAD = ['BP', 'Height', 'Pulse', 'Weight', 'Temp', 'BMI', 'Status', 'LMP', 'EDD', 'POG'];

const PREGNANCY_LABEL: Record<string, string> = {
  pregnant: 'Pregnant',
  not_pregnant: 'Not Pregnant',
  menopause: 'Menopause',
};

const cell = 'w-full px-2 py-1.5 border border-slate-300 rounded text-sm focus:outline-none focus:border-cyan-500 bg-white';

interface Props {
  vitals: Vitals[];
  appointmentId: string;
  patientId: string;
  doctorId: string;
  canManage: boolean;
  canDelete: boolean;
}

export function VitalsSection({ vitals, appointmentId, patientId, doctorId, canManage, canDelete }: Props) {
  const [createVitals] = useCreateVitalsMutation();
  const [updateVitals] = useUpdateVitalsMutation();
  const [deleteVitals] = useDeleteVitalsMutation();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [addError, setAddError] = useState('');

  if (!canManage && vitals.length === 0) return null;

  const colSpan = HEAD.length + (canManage ? 1 : 0);

  const confirmDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await deleteVitals(deleteId).unwrap();
      setDeleteId(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <FileText className="w-5 h-5 text-slate-500" />
        <h2 className="text-base font-semibold text-slate-900">Vitals</h2>
        <span className="text-xs text-slate-400 font-normal">({vitals.length})</span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-100">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50 border-b border-slate-100">
              {[...HEAD, ...(canManage ? ['Actions'] : [])].map((h) => (
                <TableHead key={h} className="py-2.5 px-4 text-left text-xs font-semibold text-slate-500">
                  {h}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody className="bg-white">
            {vitals.map((v) => {
              if (editingId === v.id) {
                return (
                  <TableRow key={v.id} className="border-b border-slate-50 bg-cyan-50/30">
                    <TableCell colSpan={colSpan} className="p-4">
                      <EditVitalsForm
                        vitals={v}
                        onCancel={() => setEditingId(null)}
                        onSave={async (payload) => {
                          await updateVitals({ id: v.id, body: payload }).unwrap();
                          setEditingId(null);
                        }}
                      />
                    </TableCell>
                  </TableRow>
                );
              }
              if (deleteId === v.id) {
                return (
                  <TableRow key={v.id} className="border-b border-slate-50">
                    <TableCell colSpan={colSpan} className="p-4">
                      <InlineConfirmBar
                        message="Permanently delete this vitals record? This cannot be undone."
                        loading={deleting}
                        onConfirm={confirmDelete}
                        onCancel={() => setDeleteId(null)}
                      />
                    </TableCell>
                  </TableRow>
                );
              }
              return (
                <TableRow key={v.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <TableCell className="py-3 px-4 text-slate-600 whitespace-normal">{v.bloodPressure || '—'}</TableCell>
                  <TableCell className="py-3 px-4 text-slate-600 whitespace-normal">{v.height ? `${v.height} cm` : '—'}</TableCell>
                  <TableCell className="py-3 px-4 text-slate-600 whitespace-normal">{v.heartRate ? `${v.heartRate} bpm` : '—'}</TableCell>
                  <TableCell className="py-3 px-4 text-slate-600 whitespace-normal">{v.weight ? `${v.weight} kg` : '—'}</TableCell>
                  <TableCell className="py-3 px-4 text-slate-600 whitespace-normal">{v.temperature ? `${v.temperature}°F` : '—'}</TableCell>
                  <TableCell className="py-3 px-4 text-slate-600 whitespace-normal">{v.bmi ? `${v.bmi}` : '—'}</TableCell>
                  <TableCell className="py-3 px-4 text-slate-600 whitespace-normal">{PREGNANCY_LABEL[v.pregnancyStatus] ?? '—'}</TableCell>
                  <TableCell className="py-3 px-4 text-slate-600 whitespace-normal">{fmtDate(v.lmp)}</TableCell>
                  <TableCell className="py-3 px-4 text-slate-600 whitespace-normal">{fmtDate(v.edd)}</TableCell>
                  <TableCell className="py-3 px-4 text-slate-600 whitespace-normal">{v.pog || '—'}</TableCell>
                  {canManage && (
                    <TableCell className="py-2 px-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => setEditingId(v.id)} title="Edit" className="p-1.5 text-slate-400 hover:text-cyan-600 hover:bg-cyan-50 rounded transition">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        {canDelete && (
                          <button onClick={() => setDeleteId(v.id)} title="Delete" className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
            {canManage && (
              <NewVitalsRow
                colSpan={colSpan}
                onAdd={async (payload) => {
                  setAddError('');
                  try {
                    await createVitals({ appointmentId, patientId, doctorId, ...payload }).unwrap();
                  } catch (err) {
                    setAddError(apiError(err, 'Could not record vitals'));
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

// One row, same as Prescriptions/Injections/Test Orders: type straight into
// the grid and hit add. BMI/EDD/POG still auto-fill from height+weight/LMP —
// `Autofill` is a formik-context watcher with no UI of its own, so it slots
// into the same row without needing the labeled block-form layout.
function NewVitalsRow({
  colSpan,
  onAdd,
}: {
  colSpan: number;
  onAdd: (payload: ReturnType<typeof vitalsToPayload>) => Promise<void>;
}) {
  const formik = useFormik({
    initialValues: emptyVitals,
    validationSchema: vitalsSchema,
    validateOnBlur: false,
    validateOnChange: false,
    onSubmit: async (values, { resetForm, setSubmitting }) => {
      try {
        await onAdd(vitalsToPayload(values));
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
    <FormikProvider value={formik}>
      <Autofill />
      <TableRow className="bg-cyan-50/20">
        <TableCell className="p-1.5">
          <input name="bloodPressure" value={formik.values.bloodPressure} onChange={formik.handleChange} placeholder="120/80" className={cell} />
        </TableCell>
        <TableCell className="p-1.5">
          <input name="height" type="number" value={formik.values.height} onChange={formik.handleChange} placeholder="165" className={cell} />
        </TableCell>
        <TableCell className="p-1.5">
          <input name="heartRate" type="number" value={formik.values.heartRate} onChange={formik.handleChange} placeholder="78" className={cell} />
        </TableCell>
        <TableCell className="p-1.5">
          <input name="weight" type="number" value={formik.values.weight} onChange={formik.handleChange} placeholder="68" className={cell} />
        </TableCell>
        <TableCell className="p-1.5">
          <input name="temperature" type="number" value={formik.values.temperature} onChange={formik.handleChange} placeholder="98.4" className={cell} />
        </TableCell>
        <TableCell className="p-1.5">
          <input name="bmi" type="number" value={formik.values.bmi} onChange={formik.handleChange} placeholder="auto" className={cell} />
        </TableCell>
        <TableCell className="p-1.5">
          <select name="pregnancyStatus" value={formik.values.pregnancyStatus} onChange={formik.handleChange} className={cell}>
            <option value="">Not recorded</option>
            {pregnancyStatusOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </TableCell>
        <TableCell className="p-1.5">
          <input name="lmp" type="date" value={formik.values.lmp} onChange={formik.handleChange} disabled={formik.values.pregnancyStatus === 'menopause'} className={`${cell} disabled:bg-slate-100 disabled:text-slate-400`} />
        </TableCell>
        <TableCell className="p-1.5">
          <input
            name="edd"
            type="date"
            value={formik.values.edd}
            onChange={formik.handleChange}
            disabled={formik.values.pregnancyStatus !== 'pregnant'}
            className={`${cell} disabled:bg-slate-100 disabled:text-slate-400`}
          />
        </TableCell>
        <TableCell className="p-1.5">
          <input
            name="pog"
            value={formik.values.pog}
            onChange={formik.handleChange}
            placeholder="28w 3d"
            disabled={formik.values.pregnancyStatus !== 'pregnant'}
            className={`${cell} disabled:bg-slate-100 disabled:text-slate-400`}
          />
        </TableCell>
        <TableCell className="p-1.5">
          <button
            type="button"
            onClick={() => formik.submitForm()}
            disabled={formik.isSubmitting || !formik.dirty}
            title="Record vitals"
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
    </FormikProvider>
  );
}

function EditVitalsForm({
  vitals,
  onCancel,
  onSave,
}: {
  vitals: Vitals;
  onCancel: () => void;
  onSave: (payload: ReturnType<typeof vitalsToPayload>) => Promise<void>;
}) {
  const [error, setError] = useState('');
  return (
    <Formik
      initialValues={vitalsToForm(vitals)}
      validationSchema={vitalsSchema}
      onSubmit={async (values, { setSubmitting }) => {
        setError('');
        try {
          await onSave(vitalsToPayload(values));
        } catch (err) {
          setError(apiError(err, 'Could not update vitals'));
        } finally {
          setSubmitting(false);
        }
      }}
    >
      {({ isSubmitting, dirty }) => (
        <Form className="grid sm:grid-cols-2 gap-4">
          <VitalsFormFields />
          {error && (
            <p className="sm:col-span-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}
          <div className="sm:col-span-2 flex gap-3">
            <button type="button" onClick={onCancel} className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-white transition text-sm">
              Cancel
            </button>
            <Button
              type="submit"
              disabled={isSubmitting || !dirty}
              variant="brand"
            >
              {isSubmitting ? <Spinner size="sm" label="Saving…" /> : 'Save Changes'}
            </Button>
          </div>
        </Form>
      )}
    </Formik>
  );
}
