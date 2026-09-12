'use client';

import { useState } from 'react';
import { Formik, Form, useFormik } from 'formik';
import { Pencil, Pill, Plus, Trash2 } from 'lucide-react';
import { apiError } from '@/lib/apiError';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { FormField } from '@/components/form/FormField';
import {
  useCreatePrescriptionMutation,
  useDeletePrescriptionMutation,
  useUpdatePrescriptionMutation,
} from '@/store/api';
import type { Prescription } from '@/lib/types';
import { rxSchema } from '../appointmentSchemas';
import { InlineConfirmBar } from './InlineConfirm';

const emptyRx = { medicineName: '', dosage: '', frequency: '', duration: '', instructions: '' };

const cell = 'w-full px-2 py-1.5 border border-slate-300 rounded text-sm focus:outline-none focus:border-cyan-500 bg-white';

const rxFields = (
  <>
    <div className="sm:col-span-2" />
    <FormField name="dosage" label="Dosage" placeholder="e.g. 500 mg" required />
    <FormField name="frequency" label="Frequency" placeholder="e.g. Twice a day" required />
    <FormField name="duration" label="Duration" placeholder="e.g. 5 days" required />
    <div className="hidden sm:block" />
    <div className="sm:col-span-2">
      <FormField name="instructions" label="Instructions" as="textarea" placeholder="e.g. After meals" rows={2} />
    </div>
  </>
);

interface Props {
  prescriptions: Prescription[];
  appointmentId: string;
  patientId: string;
  doctorId: string;
  medicineOptions: { value: string; label: string }[];
  canManage: boolean;
  canDelete: boolean;
}

export function PrescriptionsSection({
  prescriptions,
  appointmentId,
  patientId,
  doctorId,
  medicineOptions,
  canManage,
  canDelete,
}: Props) {
  const [createPrescription] = useCreatePrescriptionMutation();
  const [updatePrescription] = useUpdatePrescriptionMutation();
  const [deletePrescription] = useDeletePrescriptionMutation();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [addError, setAddError] = useState('');

  if (!canManage && prescriptions.length === 0) return null;

  const head = ['Medicine', 'Dosage', 'Frequency', 'Duration', 'Instructions'];
  const colSpan = head.length + (canManage ? 1 : 0);

  const confirmDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await deletePrescription(deleteId).unwrap();
      setDeleteId(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Pill className="w-5 h-5 text-slate-500" />
        <h2 className="text-base font-semibold text-slate-900">Prescriptions</h2>
        <span className="text-xs text-slate-400 font-normal">({prescriptions.length})</span>
      </div>

      {(prescriptions.length > 0 || canManage) && (
        <div className="overflow-x-auto rounded-lg border border-slate-100">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50 border-b border-slate-100">
                {[...head, ...(canManage ? ['Actions'] : [])].map((h) => (
                  <TableHead key={h} className="py-2.5 px-4 text-left text-xs font-semibold text-slate-500">
                    {h}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody className="bg-white">
              {prescriptions.map((rx) => {
                if (editingId === rx.id) {
                  return (
                    <TableRow key={rx.id} className="border-b border-slate-50 bg-cyan-50/30">
                      <TableCell colSpan={colSpan} className="p-4">
                        <EditRxForm
                          prescription={rx}
                          medicineOptions={medicineOptions}
                          onCancel={() => setEditingId(null)}
                          onSave={async (body) => {
                            await updatePrescription({ id: rx.id, body }).unwrap();
                            setEditingId(null);
                          }}
                        />
                      </TableCell>
                    </TableRow>
                  );
                }
                if (deleteId === rx.id) {
                  return (
                    <TableRow key={rx.id} className="border-b border-slate-50">
                      <TableCell colSpan={colSpan} className="p-4">
                        <InlineConfirmBar
                          message="Delete this prescription? This will also remove the pending pharmacy order. This cannot be undone."
                          confirmLabel="Delete Prescription"
                          loading={deleting}
                          onConfirm={confirmDelete}
                          onCancel={() => setDeleteId(null)}
                        />
                      </TableCell>
                    </TableRow>
                  );
                }
                return (
                  <TableRow key={rx.id} className="border-b border-slate-50 hover:bg-slate-50">
                    <TableCell className="py-3 px-4 font-medium text-slate-900 whitespace-normal">{rx.medicineName}</TableCell>
                    <TableCell className="py-3 px-4 text-slate-600 whitespace-normal">{rx.dosage || '—'}</TableCell>
                    <TableCell className="py-3 px-4 text-slate-600 whitespace-normal">{rx.frequency || '—'}</TableCell>
                    <TableCell className="py-3 px-4 text-slate-600 whitespace-normal">{rx.duration || '—'}</TableCell>
                    <TableCell className="py-3 px-4 text-slate-500 whitespace-normal">{rx.instructions || '—'}</TableCell>
                    {canManage && (
                      <TableCell className="py-2 px-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => setEditingId(rx.id)} title="Edit" className="p-1.5 text-slate-400 hover:text-cyan-600 hover:bg-cyan-50 rounded transition">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          {canDelete && (
                            <button onClick={() => setDeleteId(rx.id)} title="Delete" className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition">
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
                <NewRxRow
                  medicineOptions={medicineOptions}
                  colSpan={colSpan}
                  onAdd={async (body) => {
                    setAddError('');
                    try {
                      await createPrescription({ appointmentId, patientId, doctorId, ...body }).unwrap();
                    } catch (err) {
                      setAddError(apiError(err, 'Could not add prescription'));
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

// The always-present bottom row of the table: type a medicine straight into
// the grid and hit add — no separate form to open first.
function NewRxRow({
  medicineOptions,
  colSpan,
  onAdd,
}: {
  medicineOptions: { value: string; label: string }[];
  colSpan: number;
  onAdd: (body: { medicineName: string; dosage: string; frequency: string; duration: string; instructions: string }) => Promise<void>;
}) {
  const formik = useFormik({
    initialValues: emptyRx,
    validationSchema: rxSchema,
    validateOnBlur: false,
    validateOnChange: false,
    onSubmit: async (values, { resetForm, setSubmitting }) => {
      try {
        await onAdd({
          medicineName: values.medicineName,
          dosage: values.dosage.trim(),
          frequency: values.frequency.trim(),
          duration: values.duration.trim(),
          instructions: values.instructions.trim(),
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
          <select name="medicineName" value={formik.values.medicineName} onChange={formik.handleChange} className={cell}>
            <option value="">Select medicine…</option>
            {medicineOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </TableCell>
        <TableCell className="p-1.5">
          <input name="dosage" value={formik.values.dosage} onChange={formik.handleChange} placeholder="500 mg" className={cell} />
        </TableCell>
        <TableCell className="p-1.5">
          <input name="frequency" value={formik.values.frequency} onChange={formik.handleChange} placeholder="Twice a day" className={cell} />
        </TableCell>
        <TableCell className="p-1.5">
          <input name="duration" value={formik.values.duration} onChange={formik.handleChange} placeholder="5 days" className={cell} />
        </TableCell>
        <TableCell className="p-1.5">
          <input name="instructions" value={formik.values.instructions} onChange={formik.handleChange} placeholder="After meals" className={cell} />
        </TableCell>
        <TableCell className="p-1.5">
          <button
            type="button"
            onClick={() => formik.submitForm()}
            disabled={formik.isSubmitting || !formik.dirty}
            title="Add prescription"
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

function EditRxForm({
  prescription,
  medicineOptions,
  onCancel,
  onSave,
}: {
  prescription: Prescription;
  medicineOptions: { value: string; label: string }[];
  onCancel: () => void;
  onSave: (body: { medicineName: string; dosage: string; frequency: string; duration: string; instructions: string }) => Promise<void>;
}) {
  const [error, setError] = useState('');
  return (
    <Formik
      initialValues={{
        medicineName: prescription.medicineName ?? '',
        dosage: prescription.dosage ?? '',
        frequency: prescription.frequency ?? '',
        duration: prescription.duration ?? '',
        instructions: prescription.instructions ?? '',
      }}
      validationSchema={rxSchema}
      onSubmit={async (values, { setSubmitting }) => {
        setError('');
        try {
          await onSave({
            medicineName: values.medicineName,
            dosage: values.dosage.trim(),
            frequency: values.frequency.trim(),
            duration: values.duration.trim(),
            instructions: values.instructions.trim(),
          });
        } catch (err) {
          setError(apiError(err, 'Could not update prescription'));
        } finally {
          setSubmitting(false);
        }
      }}
    >
      {({ isSubmitting, dirty }) => (
        <Form className="grid sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <FormField name="medicineName" label="Medicine" as="select" placeholder="Select a medicine" options={medicineOptions} required />
          </div>
          {rxFields}
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
