'use client';

import { useState } from 'react';
import { Formik, Form, FormikProvider, useFormik } from 'formik';
import { FileText, Pencil, Plus, Trash2 } from 'lucide-react';
import { apiError } from '@/lib/apiError';
import { fmtDate, fmtDateTime } from '@/lib/date';
import { Spinner } from '@/components/ui/spinner';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { useCreateVitalsMutation, useDeleteVitalsMutation, useUpdateVitalsMutation } from '@/store/api';
import {
  Autofill,
  VitalsFormFields,
  emptyVitals,
  pregnancyStatusOptions,
  vitalEnabled,
  vitalsSchema,
  vitalsToForm,
  vitalsToPayload,
  type VitalsFormValues,
} from '@/components/vitals/vitalsForm';
import type { Vitals } from '@/lib/types';
import type { EncounterContext } from '@/lib/encounterContext';
import { InlineConfirmBar } from './InlineConfirm';

// The columns of the grid, in order. Which ones show depends on the visit's
// department (`fields`), plus any a saved row already has a value in -- history
// recorded before a department changed what it records stays readable.
const COLUMNS: { key: keyof VitalsFormValues; head: string }[] = [
  { key: 'bloodPressure', head: 'BP' },
  { key: 'height', head: 'Height' },
  { key: 'heartRate', head: 'Pulse' },
  { key: 'weight', head: 'Weight' },
  { key: 'temperature', head: 'Temp' },
  { key: 'bmi', head: 'BMI' },
  { key: 'spo2', head: 'SpO₂' },
  { key: 'respiratoryRate', head: 'Resp.' },
  { key: 'bloodGlucose', head: 'Glucose' },
  { key: 'painScore', head: 'Pain' },
  { key: 'headCircumference', head: 'Head circ.' },
  { key: 'pregnancyStatus', head: 'Status' },
  { key: 'lmp', head: 'LMP' },
  { key: 'edd', head: 'EDD' },
  { key: 'pog', head: 'POG' },
];

const hasValue = (v: Vitals, key: keyof VitalsFormValues) => {
  const value = v[key as keyof Vitals];
  return value !== undefined && value !== null && value !== '' && value !== 0;
};

const PREGNANCY_LABEL: Record<string, string> = {
  pregnant: 'Pregnant',
  not_pregnant: 'Not Pregnant',
  menopause: 'Menopause',
};

const cell = 'w-full px-2 py-1.5 border border-slate-300 rounded text-sm focus:outline-none focus:border-cyan-500 bg-white';

interface Props {
  vitals: Vitals[];
  context: EncounterContext;
  patientId: string;
  doctorId: string;
  canManage: boolean;
  canDelete: boolean;
  /** The department's `vitalsFields`; omitted, every column shows. */
  fields?: string[];
}

export function VitalsSection({ vitals, context, patientId, doctorId, canManage, canDelete, fields }: Props) {
  const [createVitals] = useCreateVitalsMutation();
  const [updateVitals] = useUpdateVitalsMutation();
  const [deleteVitals] = useDeleteVitalsMutation();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [addError, setAddError] = useState('');

  const shown = COLUMNS.filter((c) => vitalEnabled(fields, c.key) || vitals.some((v) => hasValue(v, c.key)));
  const show = (key: keyof VitalsFormValues) => shown.some((c) => c.key === key);
  const colSpan = 1 + shown.length + (canManage ? 1 : 0);

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

      {!canManage && vitals.length === 0 ? (
        <p className="text-sm text-slate-500">No vitals recorded yet.</p>
      ) : (
      <div className="overflow-x-auto rounded-lg border border-slate-100">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50 border-b border-slate-100">
              {['Recorded', ...shown.map((c) => c.head), ...(canManage ? ['Actions'] : [])].map((h) => (
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
                        fields={fields}
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
                  <TableCell className="py-3 px-4 text-slate-500 whitespace-nowrap">{fmtDateTime(v.createdAt)}</TableCell>
                  {show('bloodPressure') && <TableCell className="py-3 px-4 text-slate-600 whitespace-normal">{v.bloodPressure || '—'}</TableCell>}
                  {show('height') && <TableCell className="py-3 px-4 text-slate-600 whitespace-normal">{v.height ? `${v.height} cm` : '—'}</TableCell>}
                  {show('heartRate') && <TableCell className="py-3 px-4 text-slate-600 whitespace-normal">{v.heartRate ? `${v.heartRate} bpm` : '—'}</TableCell>}
                  {show('weight') && <TableCell className="py-3 px-4 text-slate-600 whitespace-normal">{v.weight ? `${v.weight} kg` : '—'}</TableCell>}
                  {show('temperature') && <TableCell className="py-3 px-4 text-slate-600 whitespace-normal">{v.temperature ? `${v.temperature}°F` : '—'}</TableCell>}
                  {show('bmi') && <TableCell className="py-3 px-4 text-slate-600 whitespace-normal">{v.bmi ? `${v.bmi}` : '—'}</TableCell>}
                  {show('spo2') && <TableCell className="py-3 px-4 text-slate-600 whitespace-normal">{v.spo2 ? `${v.spo2}%` : '—'}</TableCell>}
                  {show('respiratoryRate') && <TableCell className="py-3 px-4 text-slate-600 whitespace-normal">{v.respiratoryRate ? `${v.respiratoryRate}/min` : '—'}</TableCell>}
                  {show('bloodGlucose') && <TableCell className="py-3 px-4 text-slate-600 whitespace-normal">{v.bloodGlucose ? `${v.bloodGlucose} mg/dL` : '—'}</TableCell>}
                  {show('painScore') && <TableCell className="py-3 px-4 text-slate-600 whitespace-normal">{v.painScore ? `${v.painScore}/10` : '—'}</TableCell>}
                  {show('headCircumference') && <TableCell className="py-3 px-4 text-slate-600 whitespace-normal">{v.headCircumference ? `${v.headCircumference} cm` : '—'}</TableCell>}
                  {show('pregnancyStatus') && <TableCell className="py-3 px-4 text-slate-600 whitespace-normal">{PREGNANCY_LABEL[v.pregnancyStatus] ?? '—'}</TableCell>}
                  {show('lmp') && <TableCell className="py-3 px-4 text-slate-600 whitespace-normal">{fmtDate(v.lmp)}</TableCell>}
                  {show('edd') && <TableCell className="py-3 px-4 text-slate-600 whitespace-normal">{fmtDate(v.edd)}</TableCell>}
                  {show('pog') && <TableCell className="py-3 px-4 text-slate-600 whitespace-normal">{v.pog || '—'}</TableCell>}
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
                fields={fields}
                shown={shown.map((c) => c.key)}
                onAdd={async (payload) => {
                  setAddError('');
                  try {
                    await createVitals({ ...context, patientId, doctorId, ...payload }).unwrap();
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
      )}
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
  fields,
  shown,
  onAdd,
}: {
  colSpan: number;
  fields?: string[];
  /** The columns the grid is showing, so the entry row lines up under them. */
  shown: (keyof VitalsFormValues)[];
  onAdd: (payload: ReturnType<typeof vitalsToPayload>) => Promise<void>;
}) {
  const formik = useFormik({
    initialValues: emptyVitals,
    validationSchema: vitalsSchema,
    validateOnBlur: false,
    validateOnChange: false,
    onSubmit: async (values, { resetForm, setSubmitting }) => {
      try {
        await onAdd(vitalsToPayload(values, fields));
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
        <TableCell className="py-3 px-4 text-xs text-slate-400 whitespace-nowrap">Now</TableCell>
        {shown.map((key) =>
          vitalEnabled(fields, key) ? (
            <TableCell key={key} className="p-1.5">
              <NewVitalInput name={key} formik={formik} />
            </TableCell>
          ) : (
            // A column kept only to show older values: nothing to enter here.
            <TableCell key={key} className="p-1.5" />
          ),
        )}
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

const VITAL_INPUT: Record<keyof VitalsFormValues, { type?: string; placeholder?: string }> = {
  bloodPressure: { placeholder: '120/80' },
  height: { type: 'number', placeholder: '165' },
  heartRate: { type: 'number', placeholder: '78' },
  weight: { type: 'number', placeholder: '68' },
  temperature: { type: 'number', placeholder: '98.4' },
  bmi: { type: 'number', placeholder: 'auto' },
  spo2: { type: 'number', placeholder: '98' },
  respiratoryRate: { type: 'number', placeholder: '16' },
  bloodGlucose: { type: 'number', placeholder: '110' },
  painScore: { type: 'number', placeholder: '0-10' },
  headCircumference: { type: 'number', placeholder: '34' },
  pregnancyStatus: {},
  lmp: { type: 'date' },
  edd: { type: 'date' },
  pog: { placeholder: '28w 3d' },
};

function NewVitalInput({
  name,
  formik,
}: {
  name: keyof VitalsFormValues;
  formik: ReturnType<typeof useFormik<VitalsFormValues>>;
}) {
  const value = formik.values[name];
  if (name === 'pregnancyStatus') {
    return (
      <select name={name} value={value} onChange={formik.handleChange} className={cell}>
        <option value="">Not recorded</option>
        {pregnancyStatusOptions.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    );
  }
  // Dated by the pregnancy triad: LMP is moot after menopause, EDD/POG apply
  // only to a pregnancy.
  const disabled =
    (name === 'lmp' && formik.values.pregnancyStatus === 'menopause') ||
    ((name === 'edd' || name === 'pog') && formik.values.pregnancyStatus !== 'pregnant');
  return (
    <input
      name={name}
      type={VITAL_INPUT[name].type}
      value={value}
      onChange={formik.handleChange}
      placeholder={VITAL_INPUT[name].placeholder}
      disabled={disabled}
      className={`${cell} disabled:bg-slate-100 disabled:text-slate-400`}
    />
  );
}

function EditVitalsForm({
  vitals,
  fields,
  onCancel,
  onSave,
}: {
  vitals: Vitals;
  fields?: string[];
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
          await onSave(vitalsToPayload(values, fields));
        } catch (err) {
          setError(apiError(err, 'Could not update vitals'));
        } finally {
          setSubmitting(false);
        }
      }}
    >
      {({ isSubmitting, dirty }) => (
        <Form className="grid sm:grid-cols-2 gap-4">
          <VitalsFormFields fields={fields} />
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
