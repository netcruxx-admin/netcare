'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Clock, CalendarPlus, Eye, Plus, Loader2 } from 'lucide-react';
import { fmtDate } from '@/lib/date';
import { DashboardShell } from '@/components/DashboardShell';
import type { RoleViewProps } from '@/components/RoleView';
import { useGetPatientAppointmentsQuery } from '@/store/api';
import type { Appointment } from '@/lib/types';
import { hasPermission } from '@/lib/auth';
import { ActionIcon } from '../ActionIcon';

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

  const patientId = session?.patient?.id ?? '';
  const { data: appointments = [], isLoading } = useGetPatientAppointmentsQuery(patientId, { skip: !patientId });

  const statusStyle = (status: Appointment['status']) =>
    status === 'completed' ? 'bg-green-100 text-green-700'
      : status === 'cancelled' ? 'bg-red-100 text-red-700'
        : 'bg-blue-100 text-blue-700';

  const sorted = [...appointments]
    .filter((a) => statusFilter === 'all' || a.status === statusFilter)
    .sort((a, b) => (a.date < b.date ? 1 : -1));

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
        {canBook && (
          <Link
            href="/dashboard/book"
            className="ml-auto flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-500 to-brand-teal text-white rounded-lg text-sm font-semibold hover:shadow-lg transition"
          >
            <Plus className="w-4 h-4" /> Book Appointment
          </Link>
        )}
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b">
          <h3 className="font-semibold text-slate-900">All Appointments ({sorted.length})</h3>
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
          </div>
        ) : sorted.length === 0 ? (
          <div className="text-center py-16">
            <Clock className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-600 mb-6">No appointments yet</p>
            {canBook && (
              <Link
                href="/dashboard/book"
                className="inline-block px-6 py-2 bg-gradient-to-r from-cyan-500 to-brand-teal text-white rounded-lg hover:shadow-lg transition"
              >
                Book an Appointment
              </Link>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-slate-50">
                  <th className="text-left py-3 px-6 font-semibold text-slate-900">Date &amp; Time</th>
                  <th className="text-left py-3 px-6 font-semibold text-slate-900">Doctor</th>
                  <th className="text-left py-3 px-6 font-semibold text-slate-900">Reason</th>
                  <th className="text-left py-3 px-6 font-semibold text-slate-900">Status</th>
                  <th className="text-right py-3 px-6 font-semibold text-slate-900">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((apt) => (
                  <tr key={apt.id} className="border-b hover:bg-slate-50">
                    <td className="py-3 px-6 font-medium whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <DateBadge date={apt.date} />
                        <span>{fmtDate(apt.date)} at {apt.time}</span>
                      </div>
                    </td>
                    <td className="py-3 px-6 text-slate-600">{apt.doctorName ? `Dr. ${apt.doctorName}` : 'Doctor'}</td>
                    <td className="py-3 px-6 text-slate-600">
                      {apt.reason || '—'}
                      {apt.followUpOf && (
                        <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-cyan-100 text-cyan-700">
                          <CalendarPlus className="w-3 h-3" /> Follow-up
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-6">
                      <span className={`inline-block px-3 py-1 rounded-full text-sm font-semibold capitalize ${statusStyle(apt.status)}`}>
                        {apt.status}
                      </span>
                    </td>
                    <td className="py-3 px-6 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <ActionIcon icon={Eye} label="View" href={`/appointment/${apt.id}`} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
