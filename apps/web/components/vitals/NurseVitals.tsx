'use client';

import { useEffect, useMemo, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Formik, Form } from 'formik';
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
import {
  VitalsFormFields,
  emptyVitals,
  vitalsSchema,
  vitalsToPayload,
} from '@/components/vitals/vitalsForm';
import { TablePagination } from '@/components/TablePagination';
import { useServerTable } from '@/hooks/useServerTable';
import { DateRangeFilter, type DateRange } from '@/components/DateRangeFilter';
import { fmtDate } from '@/lib/date';
import { Spinner } from '@/components/ui/spinner';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';

const todayStr = new Date().toISOString().split('T')[0];

function DateBadge({ date }: { date: string }) {
  if (date === todayStr) {
    return <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">Today</span>;
  }
  if (date < todayStr) {
    return <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">Past</span>;
  }
  return <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-700">Upcoming</span>;
}

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

  const [dateRange, setDateRange] = useState<DateRange>({ from: todayStr, to: todayStr });
  const [recording, setRecording] = useState<ApptRow | null>(null);
  const [toast, setToast] = useState('');
  const table = useServerTable({ filterKey: `${dateRange.from}|${dateRange.to}` });

  // A cancelled visit has no vitals to record, so the API is asked for the two
  // statuses that do rather than for everything.
  const { data: appointmentPage, isLoading } = useListAppointmentsPagedQuery({
    q: table.q.trim() || undefined,
    status: 'scheduled,completed',
    dateFrom: dateRange.from || undefined,
    dateTo: dateRange.to || undefined,
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
          <DateRangeFilter value={dateRange} onChange={setDateRange} defaultDate={todayStr} />
        </div>

        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b">
            <h3 className="font-semibold text-slate-900">Visits ({totalVisits})</h3>
          </div>

          {isLoading ? (
            <Spinner variant="block" />
          ) : rows.length === 0 ? (
            <div className="text-center py-16">
              <HeartPulse className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-600">No visits match these filters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-b bg-slate-50">
                    <TableHead className="text-left py-3 px-6 font-semibold text-slate-900">Date / Time</TableHead>
                    <TableHead className="text-left py-3 px-6 font-semibold text-slate-900">Patient</TableHead>
                    <TableHead className="text-left py-3 px-6 font-semibold text-slate-900">Doctor</TableHead>
                    <TableHead className="text-left py-3 px-6 font-semibold text-slate-900">Vitals</TableHead>
                    <TableHead className="text-right py-3 px-6 font-semibold text-slate-900">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((a) => (
                    <TableRow key={a.id} className="border-b hover:bg-slate-50">
                      <TableCell className="py-3 px-6">
                        <div className="flex items-center gap-2 mb-0.5">
                          <DateBadge date={a.date} />
                          <p className="font-medium text-slate-900">{fmtDate(a.date)}</p>
                        </div>
                        <p className="text-xs text-slate-500">{a.time}</p>
                      </TableCell>
                      <TableCell className="py-3 px-6 text-slate-700 whitespace-normal">{a.patient}</TableCell>
                      <TableCell className="py-3 px-6 text-slate-600 whitespace-normal">{a.doctor}</TableCell>
                      <TableCell className="py-3 px-6 whitespace-normal">
                        {a.hasVitals ? (
                          <span className="inline-block px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">Recorded</span>
                        ) : (
                          <span className="inline-block px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">Pending</span>
                        )}
                      </TableCell>
                      <TableCell className="py-3 px-6 text-right whitespace-normal">
                        <Button
                          onClick={() => setRecording(a)}
                          variant="brand"
                          size="sm"
                        >
                          {a.hasVitals ? 'Add again' : 'Record'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
                  {recording.patient} · {fmtDate(recording.date)} at {recording.time}
                </p>
              </div>
              <button onClick={() => setRecording(null)} className="text-slate-400 hover:text-slate-700" aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>
            <Formik
              initialValues={emptyVitals}
              validationSchema={vitalsSchema}
              onSubmit={async (values, { setSubmitting }) => {
                setError('');
                try {
                  await createVitals({
                    appointmentId: recording.id,
                    patientId: recording.patientId,
                    doctorId: recording.doctorId,
                    ...vitalsToPayload(values),
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
              {({ isSubmitting, dirty }) => (
                <Form className="p-6 grid grid-cols-2 gap-4">
                  <VitalsFormFields />
                  {error && (
                    <div className="col-span-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                      {error}
                    </div>
                  )}
                  <div className="col-span-2 flex gap-3 pt-2">
                    <button type="button" onClick={() => setRecording(null)} className="flex-1 px-4 py-2 bg-slate-200 text-slate-700 rounded hover:bg-slate-300 transition">
                      Cancel
                    </button>
                    <Button type="submit" disabled={isSubmitting || !dirty} variant="brand" className="flex-1">
                      {isSubmitting ? <Spinner size="sm" label="Saving…" /> : 'Save Vitals'}
                    </Button>
                  </div>
                </Form>
              )}
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
