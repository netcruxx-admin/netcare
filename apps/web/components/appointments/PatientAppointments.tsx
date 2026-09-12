'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Clock, CalendarPlus, Eye, Plus } from 'lucide-react';
import { fmtDate } from '@/lib/date';
import { DashboardShell } from '@/components/DashboardShell';
import type { RoleViewProps } from '@/components/RoleView';
import { useGetPatientAppointmentsQuery } from '@/store/api';
import type { Appointment } from '@/lib/types';
import { PaymentBadge } from './PaymentBadge';
import { SortableTh, compareAppointments, useAppointmentSort } from './appointmentSort';
import { hasPermission } from '@/lib/auth';
import { ActionIcon } from '../ActionIcon';
import { Spinner } from '@/components/ui/spinner';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { DateRangeFilter, type DateRange } from '@/components/DateRangeFilter';

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

export function PatientAppointments({ session }: RoleViewProps) {
  const canBook = hasPermission(session, 'appointments.create');
  const [statusFilter, setStatusFilter] = useState<'all' | Appointment['status']>('all');
  // Today by default, same as every staff appointment board.
  const [dateRange, setDateRange] = useState<DateRange>({ from: todayStr, to: todayStr });
  const { sort, toggle } = useAppointmentSort();

  const patientId = session?.patient?.id ?? '';
  const { data: appointments = [], isLoading } = useGetPatientAppointmentsQuery(patientId, { skip: !patientId });

  const statusStyle = (status: Appointment['status']) =>
    status === 'completed' ? 'bg-green-100 text-green-700'
      : status === 'cancelled' ? 'bg-red-100 text-red-700'
        : 'bg-blue-100 text-blue-700';

  const sorted = [...appointments]
    .filter((a) => statusFilter === 'all' || a.status === statusFilter)
    .filter((a) => (!dateRange.from || a.date >= dateRange.from) && (!dateRange.to || a.date <= dateRange.to))
    .sort(compareAppointments(sort));

  return (
    <DashboardShell
      role={session.user.role}
      userName={session.user.name}
      title="Appointment History"
      subtitle="All your past and upcoming appointments"
    >
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          className="bg-white rounded-lg shadow px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-500"
        >
          <option value="all">All Statuses</option>
          <option value="scheduled">Scheduled</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <DateRangeFilter value={dateRange} onChange={setDateRange} defaultDate={todayStr} />
        {canBook && (
          <Button asChild variant="brand" className="ml-auto">
            <Link href="/dashboard/book">
              <Plus className="w-4 h-4" /> Book Appointment
            </Link>
          </Button>
        )}
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b">
          <h3 className="font-semibold text-slate-900">
            Appointments ({sorted.length})
            {(dateRange.from || dateRange.to || statusFilter !== 'all') && <span className="text-slate-400 font-normal"> (filtered)</span>}
          </h3>
        </div>
        {isLoading ? (
          <Spinner variant="block" />
        ) : sorted.length === 0 ? (
          <div className="text-center py-16">
            <Clock className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-600 mb-2">
              {dateRange.from || dateRange.to || statusFilter !== 'all' ? 'No appointments match this filter.' : 'No appointments yet'}
            </p>
            {(dateRange.from || dateRange.to || statusFilter !== 'all') && appointments.length > 0 && (
              <button
                onClick={() => { setDateRange({ from: '', to: '' }); setStatusFilter('all'); }}
                className="text-sm text-cyan-600 hover:text-cyan-700 font-medium mb-4"
              >
                Clear filters to see your full history
              </button>
            )}
            {canBook && (
              <Button asChild variant="brand">
                <Link href="/dashboard/book">Book an Appointment</Link>
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-b bg-slate-50">
                  {(
                    [
                      ['Date & Time', 'date'],
                      ['Doctor', 'doctor'],
                      ['Reason', 'reason'],
                      ['Status', 'status'],
                      ['Payment', 'payment'],
                    ] as const
                  ).map(([label, key]) => (
                    <SortableTh
                      key={key}
                      label={label}
                      sortKey={key}
                      sort={sort}
                      onSort={toggle}
                      className="text-left py-3 px-6 font-semibold text-slate-900"
                    />
                  ))}
                  <TableHead className="text-right py-3 px-6 font-semibold text-slate-900">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((apt) => (
                  <TableRow key={apt.id} className="border-b hover:bg-slate-50">
                    <TableCell className="py-3 px-6 font-medium">
                      <div className="flex items-center gap-2">
                        <DateBadge date={apt.date} />
                        <span>{fmtDate(apt.date)} at {apt.time}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-3 px-6 text-slate-600 whitespace-normal">{apt.doctorName ? `Dr. ${apt.doctorName}` : 'Doctor'}</TableCell>
                    <TableCell className="py-3 px-6 text-slate-600 whitespace-normal">
                      {apt.reason || '—'}
                      {apt.followUpOf && (
                        <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-cyan-100 text-cyan-700">
                          <CalendarPlus className="w-3 h-3" /> Follow-up
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="py-3 px-6 whitespace-normal">
                      <span className={`inline-block px-3 py-1 rounded-full text-sm font-semibold capitalize ${statusStyle(apt.status)}`}>
                        {apt.status}
                      </span>
                    </TableCell>
                    <TableCell className="py-3 px-6 whitespace-normal">
                      <PaymentBadge appointment={apt} />
                    </TableCell>
                    <TableCell className="py-3 px-6 text-right whitespace-normal">
                      <div className="flex items-center justify-end gap-1">
                        <ActionIcon icon={Eye} label="View" href={`/appointment/${apt.id}`} />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
