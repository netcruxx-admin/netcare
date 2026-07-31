'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, UserRound } from 'lucide-react';
import { DashboardShell } from '@/components/DashboardShell';
import { ExportButton } from '@/components/ExportButton';
import type { RoleViewProps } from '@/components/RoleView';
import { adminRole, doctorRole, nurseRole } from '@/lib/roles';
import {
  useGetDoctorByUserQuery,
  useListAppointmentsQuery,
  useListPatientsQuery,
} from '@/store/api';

/**
 * The patient directory for hospital staff — one component for admin, doctor and
 * nurse, which previously had three near-identical pages (doctor and nurse were
 * 76% identical line-for-line).
 *
 * The rows are computed once; what each role sees is described by the variables
 * below rather than by branching through the markup.
 */

function toDateStr(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
const todayStr = toDateStr(new Date());

interface PatientRow {
  patientId: string;
  name: string;
  email: string;
  phone: string;
  gender: string;
  bloodGroup: string;
  /** Completed visits. */
  visits: number;
  /** Appointments of any status. */
  appointments: number;
  lastVisit: string | null;
  nextVisit: string | null;
}

interface Column {
  header: string;
  render: (row: PatientRow) => React.ReactNode;
  align?: 'right';
}

const nameWithPhoneColumn: Column = {
  header: 'Patient',
  render: (row) => (
    <>
      <p className="font-medium text-slate-900">{row.name}</p>
      <p className="text-xs text-slate-500">{row.phone}</p>
    </>
  ),
};
const genderColumn: Column = { header: 'Gender', render: (row) => row.gender };
const bloodGroupColumn: Column = { header: 'Blood Group', render: (row) => row.bloodGroup };
const nextVisitColumn: Column = {
  header: 'Next Visit',
  render: (row) =>
    row.nextVisit ? (
      <span className="inline-block px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
        {row.nextVisit}
      </span>
    ) : (
      <span className="text-slate-400 text-sm">—</span>
    ),
};
const detailsColumn: Column = {
  header: 'Actions',
  align: 'right',
  render: (row) => (
    <Link
      href={`/patient/${row.patientId}`}
      className="text-cyan-600 hover:text-cyan-700 font-semibold text-sm"
    >
      View Details
    </Link>
  ),
};

// What each role sees. Adding a role to this screen means adding an entry here.
const viewByRole: Record<
  string,
  {
    title: string;
    subtitle: string;
    searchPlaceholder: string;
    columns: Column[];
    exportHeaders?: string[];
    exportRow?: (row: PatientRow) => (string | number)[];
    /** Doctor: only patients who have appointments with them. */
    onlyOwnPatients?: boolean;
    /** Sort applied after filtering. */
    sort: (a: PatientRow, b: PatientRow) => number;
  }
> = {
  [adminRole]: {
    title: 'Patients',
    subtitle: 'Registered patients',
    searchPlaceholder: 'Search by name, email or phone…',
    columns: [
      { header: 'Name', render: (row) => <span className="font-medium text-slate-900">{row.name}</span> },
      { header: 'Email', render: (row) => <span className="text-sm">{row.email}</span> },
      genderColumn,
      bloodGroupColumn,
      { header: 'Phone', render: (row) => row.phone },
      {
        header: 'Appointments',
        render: (row) => <span className="font-semibold text-slate-900">{row.appointments}</span>,
      },
    ],
    exportHeaders: ['Name', 'Email', 'Gender', 'Blood Group', 'Phone', 'Appointments'],
    exportRow: (row) => [row.name, row.email, row.gender, row.bloodGroup, row.phone, row.appointments],
    sort: (a, b) => b.appointments - a.appointments,
  },
  [doctorRole]: {
    title: 'My Patients',
    subtitle: 'Patients under your care',
    searchPlaceholder: 'Search patient or phone…',
    columns: [
      nameWithPhoneColumn,
      genderColumn,
      { header: 'Visits', render: (row) => row.visits },
      { header: 'Last Visit', render: (row) => row.lastVisit ?? '—' },
      nextVisitColumn,
      detailsColumn,
    ],
    onlyOwnPatients: true,
    sort: (a, b) => a.name.localeCompare(b.name),
  },
  [nurseRole]: {
    title: 'Patients',
    subtitle: 'All registered patients',
    searchPlaceholder: 'Search patient or phone…',
    columns: [nameWithPhoneColumn, genderColumn, bloodGroupColumn, nextVisitColumn, detailsColumn],
    exportHeaders: ['Name', 'Phone', 'Gender', 'Blood Group', 'Next Visit'],
    exportRow: (row) => [row.name, row.phone, row.gender, row.bloodGroup, row.nextVisit ?? ''],
    sort: (a, b) => a.name.localeCompare(b.name),
  },
};

export function HospitalPatients({ session }: RoleViewProps) {
  const role = session.user.role;
  const view = viewByRole[role] ?? viewByRole[nurseRole];
  const [query, setQuery] = useState('');

  // A doctor's list is scoped to their own appointments, so their doctor record
  // has to resolve before the appointments query can be filtered.
  const { data: doctor } = useGetDoctorByUserQuery(session.user.id, {
    skip: !view.onlyOwnPatients,
  });
  const appointmentsReady = !view.onlyOwnPatients || Boolean(doctor);
  const { data: appointments = [] } = useListAppointmentsQuery(
    view.onlyOwnPatients && doctor ? { doctorId: doctor.id } : undefined,
    { skip: !appointmentsReady },
  );
  const { data: patients = [] } = useListPatientsQuery();

  const rows = useMemo(() => {
    const byPatient = new Map<string, typeof appointments>();
    appointments.forEach((appointment) => {
      const list = byPatient.get(appointment.patientId) ?? [];
      list.push(appointment);
      byPatient.set(appointment.patientId, list);
    });

    const source = view.onlyOwnPatients
      ? patients.filter((patient) => byPatient.has(patient.id))
      : patients;

    const query_ = query.trim().toLowerCase();
    return source
      .map((patient) => {
        const own = byPatient.get(patient.id) ?? [];
        const past = own
          .filter((a) => a.status !== 'cancelled' && a.date <= todayStr)
          .sort((a, b) => b.date.localeCompare(a.date));
        const upcoming = own
          .filter((a) => a.status === 'scheduled' && a.date >= todayStr)
          .sort((a, b) => a.date.localeCompare(b.date));
        return {
          patientId: patient.id,
          name: patient.user?.name ?? 'Patient',
          email: patient.user?.email ?? '—',
          phone: patient.phone || patient.user?.phone || '—',
          gender: patient.gender || '—',
          bloodGroup: patient.bloodGroup || '—',
          visits: own.filter((a) => a.status === 'completed').length,
          appointments: own.length,
          lastVisit: past[0]?.date ?? null,
          nextVisit: upcoming[0]?.date ?? null,
        };
      })
      .filter((row) => {
        if (!query_) return true;
        return (
          row.name.toLowerCase().includes(query_) ||
          row.email.toLowerCase().includes(query_) ||
          row.phone.toLowerCase().includes(query_)
        );
      })
      .sort(view.sort);
  }, [patients, appointments, query, view]);

  return (
    <DashboardShell
      role={role}
      userName={session.user.name}
      title={view.title}
      subtitle={view.subtitle}
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={view.searchPlaceholder}
              className="w-full pl-9 pr-3 py-2 bg-white rounded-lg shadow text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>
          {view.exportHeaders && view.exportRow && (
            <ExportButton
              filename="patients"
              headers={view.exportHeaders}
              rows={rows.map(view.exportRow)}
            />
          )}
        </div>

        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b">
            <h3 className="font-semibold text-slate-900">Patients ({rows.length})</h3>
          </div>
          {rows.length === 0 ? (
            <div className="text-center py-16">
              <UserRound className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-600">No patients found.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-slate-50">
                    {view.columns.map((column) => (
                      <th
                        key={column.header}
                        className={`py-3 px-6 font-semibold text-slate-900 ${
                          column.align === 'right' ? 'text-right' : 'text-left'
                        }`}
                      >
                        {column.header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.patientId} className="border-b hover:bg-slate-50">
                      {view.columns.map((column) => (
                        <td
                          key={column.header}
                          className={`py-3 px-6 text-slate-600 ${
                            column.align === 'right' ? 'text-right' : ''
                          }`}
                        >
                          {column.render(row)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
