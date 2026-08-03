'use client';

import { useEffect, useMemo, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import { Search, HeartPulse, X, CheckCircle } from 'lucide-react';
import type { Appointment } from '@/lib/types';
import { apiError } from '@/lib/apiError';
import {
  useCreateVitalsMutation,
  useGetAppointmentQuery,
  useListAppointmentsPagedQuery,
} from '@/store/api';
import { DashboardShell } from '@/components/DashboardShell';
import type { RoleViewProps } from '@/components/RoleView';
import { FormField } from '@/components/form/FormField';
import { TablePagination } from '@/components/TablePagination';
import { useServerTable } from '@/hooks/useServerTable';

function toDateStr(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
const todayStr = toDateStr(new Date());

const numOpt = Yup.number()
  .transform((v, orig) => (orig === '' ? undefined : v))
  .typeError('Enter a number')
  .min(0, 'Cannot be negative')
  .notRequired();

const vitalsSchema = Yup.object({
  temperature: numOpt,
  heartRate: numOpt,
  respiratoryRate: numOpt,
  weight: numOpt,
  height: numOpt,
  bloodPressure: Yup.string().max(15, 'Too long'),
});

interface ApptRow extends Appointment {
  patient: string;
  doctor: string;
  hasVitals: boolean;
}

/** Names and the vitals flag are resolved by the API and arrive on the row. */
const toRow = (a: Appointment): ApptRow => ({
  ...a,
  patient: a.patientName || 'Patient',
  doctor: a.doctorName ? `Dr. ${a.doctorName}` : '—',
  hasVitals: a.hasVitals ?? false,
});

function NurseVitalsInner({ session }: RoleViewProps) {
  const searchParams = useSearchParams();
  const apptParam = searchParams.get('appt');

  const [date, setDate] = useState<string>(todayStr);
  const [recording, setRecording] = useState<ApptRow | null>(null);
  const [toast, setToast] = useState('');
  const table = useServerTable({ filterKey: date });

  // A cancelled visit has no vitals to record, so the API is asked for the two
  // statuses that do rather than for everything.
  const { data: appointmentPage } = useListAppointmentsPagedQuery({
    q: table.q.trim() || undefined,
    status: 'scheduled,completed',
    date: date || undefined,
    limit: table.limit,
    offset: table.offset,
  });
  const totalVisits = appointmentPage?.total ?? 0;
  // The deep-linked appointment is fetched by id: it may well be on another
  // page of the list, and looking for it in the page on screen would silently
  // fail to open the modal.
  const { data: linkedAppointment } = useGetAppointmentQuery(apptParam ?? '', {
    skip: !apptParam,
  });
  const [createVitals] = useCreateVitalsMutation();
  const [error, setError] = useState('');

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  };

  const rows = useMemo<ApptRow[]>(
    () => (appointmentPage?.items ?? []).map(toRow),
    [appointmentPage],
  );

  // Deep-link: open the recording modal for ?appt=<id>.
  useEffect(() => {
    if (linkedAppointment) setRecording(toRow(linkedAppointment));
  }, [linkedAppointment]);

  return (
    <DashboardShell role={session.user.role} userName={session.user.name} title="Record Vitals" subtitle="Capture patient vitals against a visit">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={table.search}
              onChange={(e) => table.setSearch(e.target.value)}
              placeholder="Search patient or doctor…"
              className="w-full pl-9 pr-3 py-2 bg-white rounded-lg shadow text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="px-3 py-2 bg-white rounded-lg shadow text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
          {date && (
            <button onClick={() => setDate('')} className="text-sm text-cyan-600 hover:text-cyan-700 font-semibold">
              Clear date
            </button>
          )}
        </div>

        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b">
            <h3 className="font-semibold text-slate-900">Visits ({totalVisits})</h3>
          </div>
          {rows.length === 0 ? (
            <div className="text-center py-16">
              <HeartPulse className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-600">No visits match these filters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-slate-50">
                    <th className="text-left py-3 px-6 font-semibold text-slate-900">Date / Time</th>
                    <th className="text-left py-3 px-6 font-semibold text-slate-900">Patient</th>
                    <th className="text-left py-3 px-6 font-semibold text-slate-900">Doctor</th>
                    <th className="text-left py-3 px-6 font-semibold text-slate-900">Vitals</th>
                    <th className="text-right py-3 px-6 font-semibold text-slate-900">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((a) => (
                    <tr key={a.id} className="border-b hover:bg-slate-50">
                      <td className="py-3 px-6">
                        <p className="font-medium text-slate-900">{a.date}</p>
                        <p className="text-xs text-slate-500">{a.time}</p>
                      </td>
                      <td className="py-3 px-6 text-slate-700">{a.patient}</td>
                      <td className="py-3 px-6 text-slate-600">{a.doctor}</td>
                      <td className="py-3 px-6">
                        {a.hasVitals ? (
                          <span className="inline-block px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">Recorded</span>
                        ) : (
                          <span className="inline-block px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">Pending</span>
                        )}
                      </td>
                      <td className="py-3 px-6 text-right">
                        <button
                          onClick={() => setRecording(a)}
                          className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-brand-teal text-white text-sm font-semibold hover:shadow transition"
                        >
                          {a.hasVitals ? 'Add again' : 'Record'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <TablePagination
                page={table.page}
                pageSize={table.pageSize}
                total={totalVisits}
                onPageChange={table.setPage}
              />
            </div>
          )}
        </div>
      </div>

      {/* Record vitals modal */}
      {recording && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div>
                <h3 className="font-semibold text-slate-900">Record Vitals</h3>
                <p className="text-xs text-slate-500">
                  {recording.patient} · {recording.date} {recording.time}
                </p>
              </div>
              <button onClick={() => setRecording(null)} className="text-slate-400 hover:text-slate-700" aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>
            <Formik
              initialValues={{ temperature: '', bloodPressure: '', heartRate: '', respiratoryRate: '', weight: '', height: '', notes: '' }}
              validationSchema={vitalsSchema}
              onSubmit={async (values, { setSubmitting }) => {
                setError('');
                try {
                  await createVitals({
                    appointmentId: recording.id,
                    patientId: recording.patientId,
                    doctorId: recording.doctorId,
                    temperature: Number(values.temperature) || 0,
                    bloodPressure: values.bloodPressure,
                    heartRate: Number(values.heartRate) || 0,
                    respiratoryRate: Number(values.respiratoryRate) || 0,
                    weight: Number(values.weight) || 0,
                    height: Number(values.height) || 0,
                    notes: values.notes,
                  }).unwrap();
                } catch (err) {
                  setError(apiError(err, 'Could not record vitals'));
                  setSubmitting(false);
                  return;
                }
                setRecording(null);
                setSubmitting(false);
                flash('Vitals recorded');
              }}
            >
              <Form className="p-6 grid grid-cols-2 gap-4">
                <FormField name="temperature" label="Temperature (°C)" type="number" placeholder="36.8" />
                <FormField name="bloodPressure" label="Blood Pressure" placeholder="120/80" />
                <FormField name="heartRate" label="Heart Rate (bpm)" type="number" placeholder="78" />
                <FormField name="respiratoryRate" label="Respiratory Rate (/min)" type="number" placeholder="16" />
                <FormField name="weight" label="Weight (kg)" type="number" placeholder="68" />
                <FormField name="height" label="Height (cm)" type="number" placeholder="165" />
                <div className="col-span-2">
                  <FormField name="notes" label="Notes" as="textarea" placeholder="Any observations" rows={2} />
                </div>
                <div className="col-span-2 flex gap-3 pt-2">
                  <button type="button" onClick={() => setRecording(null)} className="flex-1 px-4 py-2 bg-slate-200 text-slate-700 rounded hover:bg-slate-300 transition">
                    Cancel
                  </button>
                  <button type="submit" className="flex-1 px-4 py-2 bg-gradient-to-r from-cyan-500 to-brand-teal text-white rounded hover:shadow-lg font-semibold transition">
                    Save Vitals
                  </button>
                </div>
              </Form>
            </Formik>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-slate-900 text-white px-4 py-2.5 rounded-lg shadow-lg">
          <CheckCircle className="w-4 h-4 text-green-400" />
          {toast}
        </div>
      )}
    </DashboardShell>
  );
}

export function NurseVitals({ session }: RoleViewProps) {
  return (
    <Suspense fallback={null}>
      <NurseVitalsInner session={session} />
    </Suspense>
  );
}
