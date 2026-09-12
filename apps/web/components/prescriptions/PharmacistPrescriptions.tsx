'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import { ActionIcon } from '@/components/ActionIcon';
import { FormField } from '@/components/form/FormField';
import { Search, Pill, Eye, Send, CheckCircle2, X } from 'lucide-react';
import type { Prescription } from '@/lib/types';
import {
  useCreateMedicationOrderMutation,
  useLazyListPrescriptionsPagedQuery,
  useListMedicationOrdersQuery,
  useListMedicinesQuery,
  useListPrescriptionsPagedQuery,
} from '@/store/api';
import { toast } from 'sonner';
import { apiError } from '@/lib/apiError';
import { hasPermission } from '@/lib/auth';
import { DashboardShell } from '@/components/DashboardShell';
import type { RoleViewProps } from '@/components/RoleView';
import { ExportButton } from '@/components/ExportButton';
import { TablePagination } from '@/components/TablePagination';
import { useServerTable } from '@/hooks/useServerTable';
import { fmtDate } from '@/lib/date';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

const toRow = (rx: Prescription) => ({
  ...rx,
  patient: rx.patientName || 'Patient',
  date: fmtDate(rx.createdAt),
});

const exportRow = (r: ReturnType<typeof toRow>) => [
  r.date, r.patient, r.medicineName, r.dosage, r.frequency, r.duration, r.instructions,
];

interface QueueValues {
  medicineId: string;
  quantity: string;
}

const queueSchema = Yup.object({
  quantity: Yup.string().test('qty', 'Quantity must be a whole number of at least 1', (v) => {
    const n = Number(v);
    return Number.isInteger(n) && n >= 1;
  }),
});

export function PharmacistPrescriptions({ session }: RoleViewProps) {
  const table = useServerTable();
  // Sending a prescription to the queue raises a medication order, so it needs
  // the same grant the queue's own "new order" button does.
  const canQueue = hasPermission(session, 'medication_orders.manage');
  const [queueing, setQueueing] = useState<Prescription | null>(null);
  const [formError, setFormError] = useState('');

  const { data: medicines = [] } = useListMedicinesQuery(undefined, { skip: !canQueue });
  // Which prescriptions are already queued. Without this the pharmacist cannot
  // tell what they have already sent, and the server's refusal would be the
  // first they hear of it.
  const { data: orders = [] } = useListMedicationOrdersQuery(undefined, { skip: !canQueue });
  const [createOrder] = useCreateMedicationOrderMutation();
  const queued = useMemo(
    () => new Set(orders.filter((o) => o.prescriptionId && o.status !== 'cancelled').map((o) => o.prescriptionId)),
    [orders],
  );

  const openQueue = (rx: Prescription) => {
    setFormError('');
    setQueueing(rx);
  };

  // Best-effort match on name so the common case is one click. The pharmacist
  // confirms it either way — the catalogue item is what stock moves against,
  // and a wrong guess would move the wrong stock.
  const matchedMedicineId = (rx: Prescription) =>
    medicines.find((m) => m.name.trim().toLowerCase() === (rx.medicineName ?? '').trim().toLowerCase())?.id ?? '';

  const listArgs = { q: table.q.trim() || undefined };
  const { data: prescriptionPage, isLoading } = useListPrescriptionsPagedQuery({
    ...listArgs,
    limit: table.limit,
    offset: table.offset,
  });
  const totalPrescriptions = prescriptionPage?.total ?? 0;
  const [fetchAllForExport] = useLazyListPrescriptionsPagedQuery();

  const rows = useMemo(() => (prescriptionPage?.items ?? []).map(toRow), [prescriptionPage]);

  return (
    <DashboardShell role={session.user.role} userName={session.user.name} title="Prescriptions" subtitle="Medicines prescribed by doctors">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={table.search}
              onChange={(e) => table.setSearch(e.target.value)}
              placeholder="Search patient or medicine…"
              className="w-full pl-9 pr-3 py-2 bg-white rounded-lg shadow text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>
          <ExportButton
            filename="prescriptions"
            headers={['Date', 'Patient', 'Medicine', 'Dosage', 'Frequency', 'Duration', 'Instructions']}
            rows={rows.map(exportRow)}
            getRows={async () => {
              const all = await fetchAllForExport(listArgs).unwrap();
              return all.items.map(toRow).map(exportRow);
            }}
          />
        </div>

        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b">
            <h3 className="font-semibold text-slate-900">Prescriptions ({totalPrescriptions})</h3>
          </div>
          {isLoading ? (
            <Spinner variant="block" />
          ) : rows.length === 0 ? (
            <div className="text-center py-16">
              <Pill className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-600">No prescriptions found.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-b bg-slate-50">
                    <TableHead className="text-left py-3 px-6 font-semibold text-slate-900">Date</TableHead>
                    <TableHead className="text-left py-3 px-6 font-semibold text-slate-900">Patient</TableHead>
                    <TableHead className="text-left py-3 px-6 font-semibold text-slate-900">Medicine</TableHead>
                    <TableHead className="text-left py-3 px-6 font-semibold text-slate-900">Dosage</TableHead>
                    <TableHead className="text-left py-3 px-6 font-semibold text-slate-900">Frequency</TableHead>
                    <TableHead className="text-left py-3 px-6 font-semibold text-slate-900">Duration</TableHead>
                    <TableHead className="text-right py-3 px-6 font-semibold text-slate-900">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id} className="border-b hover:bg-slate-50">
                      <TableCell className="py-3 px-6 text-slate-600">{r.date}</TableCell>
                      <TableCell className="py-3 px-6 font-medium text-slate-900 whitespace-normal">{r.patient}</TableCell>
                      <TableCell className="py-3 px-6 whitespace-normal">
                        <span className="inline-flex items-center gap-1.5 text-slate-900 font-medium">
                          <Pill className="w-4 h-4 text-cyan-600" /> {r.medicineName}
                        </span>
                        {r.instructions && <p className="text-xs text-slate-500 mt-0.5">{r.instructions}</p>}
                      </TableCell>
                      <TableCell className="py-3 px-6 text-slate-600 whitespace-normal">{r.dosage}</TableCell>
                      <TableCell className="py-3 px-6 text-slate-600 whitespace-normal">{r.frequency}</TableCell>
                      <TableCell className="py-3 px-6 text-slate-600 whitespace-normal">{r.duration}</TableCell>
                      <TableCell className="py-3 px-6 text-right whitespace-normal">
                        <div className="flex items-center justify-end gap-1">
                          {canQueue && (
                            queued.has(r.id) ? (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600 px-2">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Queued
                              </span>
                            ) : (
                              <ActionIcon icon={Send} label="Send to dispense queue" onClick={() => openQueue(r)} />
                            )
                          )}
                          <Link href={`/appointment/${r.appointmentId}`}>
                            <ActionIcon icon={Eye} label="View appointment" />
                          </Link>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <TablePagination
                page={table.page}
                pageSize={table.pageSize}
                total={totalPrescriptions}
                onPageChange={table.setPage}
              />
            </div>
          )}
        </div>
      </div>

      {queueing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-2xl max-w-md w-full p-6">
            <Formik<QueueValues>
              initialValues={{ medicineId: matchedMedicineId(queueing), quantity: '1' }}
              validationSchema={queueSchema}
              onSubmit={async (values, { setSubmitting }) => {
                setFormError('');
                try {
                  await createOrder({
                    appointmentId: queueing.appointmentId,
                    patientId: queueing.patientId,
                    // The prescriber is on the prescription; the pharmacist is not it.
                    doctorId: queueing.doctorId,
                    prescriptionId: queueing.id,
                    medicineId: values.medicineId || undefined,
                    medicineName: queueing.medicineName,
                    quantity: Number(values.quantity),
                    dosage: queueing.dosage,
                    route: 'Oral',
                    frequency: queueing.frequency,
                    duration: queueing.duration,
                    instructions: queueing.instructions,
                  }).unwrap();
                  toast.success('Sent to the dispense queue');
                  setQueueing(null);
                } catch (err) {
                  setFormError(apiError(err, 'Could not queue this prescription'));
                } finally {
                  setSubmitting(false);
                }
              }}
            >
              {({ isSubmitting }) => (
                <Form className="space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-bold text-slate-900">Send to dispense queue</h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {queueing.medicineName} for {queueing.patientName || 'the patient'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setQueueing(null)}
                      aria-label="Close"
                      className="text-slate-400 hover:text-slate-900 transition p-1 -m-1"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <dl className="grid grid-cols-3 gap-3 text-sm bg-slate-50 rounded-lg p-3">
                    <div>
                      <dt className="text-xs text-slate-400">Dosage</dt>
                      <dd className="text-slate-800">{queueing.dosage || '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-400">Frequency</dt>
                      <dd className="text-slate-800">{queueing.frequency || '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-400">Duration</dt>
                      <dd className="text-slate-800">{queueing.duration || '—'}</dd>
                    </div>
                  </dl>

                  <div>
                    <FormField
                      name="medicineId"
                      label="Catalogue medicine"
                      as="select"
                      placeholder="Not stocked — dispense without touching inventory"
                      options={medicines.map((m) => ({
                        value: m.id,
                        label: `${[m.name, m.strength, m.form].filter(Boolean).join(' · ')} (${m.stock} in stock)`,
                      }))}
                    />
                    <p className="text-xs text-slate-400 mt-1">
                      Stock moves against this item, so it is worth checking the match.
                    </p>
                  </div>

                  <div>
                    <FormField name="quantity" label="Quantity" type="number" min="1" required />
                    <p className="text-xs text-slate-400 mt-1">
                      Units to hand over — a prescription records the dose, not the count.
                    </p>
                  </div>

                  {formError && (
                    <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                      {formError}
                    </p>
                  )}

                  <div className="flex justify-end gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => setQueueing(null)}
                      className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition"
                    >
                      Cancel
                    </button>
                    <Button
                      type="submit"
                      disabled={isSubmitting}
                      variant="brand"
                    >
                      {isSubmitting ? <Spinner size="sm" label="Sending…" /> : 'Send to queue'}
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
