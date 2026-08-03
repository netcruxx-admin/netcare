'use client';

import { useMemo, useState } from 'react';
import { Search, CalendarDays, Eye, HeartPulse } from 'lucide-react';
import type { Appointment } from '@/lib/types';
import {
  useLazyListAppointmentsPagedQuery,
  useListAppointmentsPagedQuery,
} from '@/store/api';
import { DashboardShell } from '@/components/DashboardShell';
import type { RoleViewProps } from '@/components/RoleView';
import { ExportButton } from '@/components/ExportButton';
import { ActionIcon } from '@/components/ActionIcon';
import { TablePagination } from '@/components/TablePagination';
import { useServerTable } from '@/hooks/useServerTable';

function toDateStr(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
const todayStr = toDateStr(new Date());

const STATUS_STYLE: Record<Appointment['status'], string> = {
  scheduled: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
};

const toRow = (a: Appointment) => ({
  ...a,
  // Names and the vitals flag are resolved by the API, so this screen no longer
  // fetches every patient, doctor and vitals row in the hospital.
  patient: a.patientName || 'Patient',
  doctor: a.doctorName ? `Dr. ${a.doctorName}` : '—',
  hasVitals: a.hasVitals ?? false,
});

const exportRow = (r: ReturnType<typeof toRow>) => [
  r.date, r.time, r.patient, r.doctor, r.status, r.hasVitals ? 'Recorded' : 'Pending',
];

export function NurseAppointments({ session }: RoleViewProps) {
  const [status, setStatus] = useState<'all' | Appointment['status']>('all');
  const [date, setDate] = useState<string>(todayStr);
  const table = useServerTable({ filterKey: `${status}|${date}` });

  const listArgs = {
    q: table.q.trim() || undefined,
    status: status === 'all' ? undefined : status,
    date: date || undefined,
  };
  const { data: appointmentPage } = useListAppointmentsPagedQuery({
    ...listArgs,
    limit: table.limit,
    offset: table.offset,
  });
  const totalAppointments = appointmentPage?.total ?? 0;
  const [fetchAllForExport] = useLazyListAppointmentsPagedQuery();

  const rows = useMemo(() => (appointmentPage?.items ?? []).map(toRow), [appointmentPage]);

  return (
    <DashboardShell role={session.user.role} userName={session.user.name} title="Appointments" subtitle="Support and vitals">
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
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
            className="px-3 py-2 bg-white rounded-lg shadow text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
          >
            <option value="all">All statuses</option>
            <option value="scheduled">Scheduled</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          {date && (
            <button onClick={() => setDate('')} className="text-sm text-cyan-600 hover:text-cyan-700 font-semibold">
              Clear date
            </button>
          )}
          <div className="ml-auto">
            <ExportButton
              filename="appointments"
              headers={['Date', 'Time', 'Patient', 'Doctor', 'Status', 'Vitals']}
              rows={rows.map(exportRow)}
              getRows={async () => {
                const all = await fetchAllForExport(listArgs).unwrap();
                return all.items.map(toRow).map(exportRow);
              }}
            />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b">
            <h3 className="font-semibold text-slate-900">Appointments ({totalAppointments})</h3>
          </div>
          {rows.length === 0 ? (
            <div className="text-center py-16">
              <CalendarDays className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-600">No appointments match these filters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-slate-50">
                    <th className="text-left py-3 px-6 font-semibold text-slate-900">Date / Time</th>
                    <th className="text-left py-3 px-6 font-semibold text-slate-900">Patient</th>
                    <th className="text-left py-3 px-6 font-semibold text-slate-900">Doctor</th>
                    <th className="text-left py-3 px-6 font-semibold text-slate-900">Status</th>
                    <th className="text-left py-3 px-6 font-semibold text-slate-900">Vitals</th>
                    <th className="text-right py-3 px-6 font-semibold text-slate-900">Actions</th>
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
                        <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold capitalize ${STATUS_STYLE[a.status]}`}>
                          {a.status}
                        </span>
                      </td>
                      <td className="py-3 px-6">
                        {a.hasVitals ? (
                          <span className="inline-block px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">Recorded</span>
                        ) : (
                          <span className="inline-block px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">Pending</span>
                        )}
                      </td>
                      <td className="py-3 px-6">
                        <div className="flex items-center justify-end gap-1">
                          <ActionIcon icon={Eye} label="View appointment" href={`/appointment/${a.id}`} />
                          {a.status !== 'cancelled' && (
                            <ActionIcon
                              icon={HeartPulse}
                              label={a.hasVitals ? 'Update vitals' : 'Record vitals'}
                              href={`/dashboard/vitals?appt=${a.id}`}
                              tone="success"
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <TablePagination
                page={table.page}
                pageSize={table.pageSize}
                total={totalAppointments}
                onPageChange={table.setPage}
              />
            </div>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
