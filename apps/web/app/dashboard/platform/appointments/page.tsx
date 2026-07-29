'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CalendarDays, Plus } from 'lucide-react';
import { authStorage } from '@/lib/auth';
import { DashboardShell } from '@/components/DashboardShell';
import { AddAppointmentModal } from '@/components/superadmin/AddAppointmentModal';
import { HospitalBadge } from '@/components/superadmin/HospitalBadge';
import { useGetSuperadminAppointmentsQuery, useListHospitalsQuery } from '@/store/api';

const STATUS_STYLES: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
};

export default function PlatformAppointmentsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedHospitalId = searchParams.get('h') ?? '';

  const [session, setSession] = useState<ReturnType<typeof authStorage.getSession>>(null);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    const s = authStorage.getSession();
    if (!s || s.user.role !== 'superadmin') router.push('/login');
    else setSession(s);
  }, [router]);

  const { data: allAppointments = [], isLoading, refetch } = useGetSuperadminAppointmentsQuery();
  const { data: hospitals = [] } = useListHospitalsQuery();

  if (!session) return null;

  const appointments = selectedHospitalId
    ? allAppointments.filter((a) => a.hospitalId === selectedHospitalId)
    : allAppointments;

  const showHospital = !selectedHospitalId;

  return (
    <DashboardShell
      role="superadmin"
      userName={session.user.name}
      title="All Appointments"
      subtitle={selectedHospitalId ? 'Filtered by selected hospital' : 'Across every hospital on the platform'}
    >
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <p className="text-sm text-slate-500">
            {appointments.length} appointment{appointments.length !== 1 ? 's' : ''}
            {selectedHospitalId && <span className="text-slate-400"> (filtered)</span>}
          </p>
          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-700 transition"
          >
            <Plus className="w-4 h-4" /> Add Appointment
          </button>
        </div>
        {isLoading ? (
          <div className="py-16 text-center text-slate-400 text-sm">Loading…</div>
        ) : appointments.length === 0 ? (
          <div className="py-16 text-center">
            <CalendarDays className="w-16 h-16 text-slate-200 mx-auto mb-4" />
            <p className="text-slate-500">No appointments found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {showHospital && <th className="text-left py-3 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wide">Hospital</th>}
                  {['Date', 'Time', 'Patient', 'Doctor', 'Status', 'Mode'].map((h) => (
                    <th key={h} className="text-left py-3 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {appointments.map((a) => (
                  <tr key={a.id} className="border-b border-slate-50 hover:bg-slate-50 transition">
                    {showHospital && (
                      <td className="py-3 px-6">
                        <HospitalBadge hospitalId={a.hospitalId} hospitals={hospitals} />
                      </td>
                    )}
                    <td className="py-3 px-6 text-slate-900 text-sm">{a.date}</td>
                    <td className="py-3 px-6 text-slate-600 text-sm">{a.time}</td>
                    <td className="py-3 px-6 text-slate-600 text-xs font-mono">{a.patientId}</td>
                    <td className="py-3 px-6 text-slate-600 text-xs font-mono">{a.doctorId}</td>
                    <td className="py-3 px-6">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_STYLES[a.status] ?? 'bg-slate-100 text-slate-600'}`}>
                        {a.status}
                      </span>
                    </td>
                    <td className="py-3 px-6 text-slate-600 capitalize text-sm">{a.mode ?? 'in-person'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AddAppointmentModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={() => { refetch(); setModalOpen(false); }}
        preselectedHospitalId={selectedHospitalId}
        hospitals={hospitals}
      />
    </DashboardShell>
  );
}
