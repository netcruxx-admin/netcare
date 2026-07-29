'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Stethoscope, Plus } from 'lucide-react';
import { authStorage } from '@/lib/auth';
import { DashboardShell } from '@/components/DashboardShell';
import { AddDoctorModal } from '@/components/superadmin/AddDoctorModal';
import { HospitalBadge } from '@/components/superadmin/HospitalBadge';
import { useGetSuperadminDoctorsQuery, useListHospitalsQuery } from '@/store/api';

export default function PlatformDoctorsPage() {
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

  const { data: allDoctors = [], isLoading, refetch } = useGetSuperadminDoctorsQuery();
  const { data: hospitals = [] } = useListHospitalsQuery();

  if (!session) return null;

  const doctors = selectedHospitalId
    ? allDoctors.filter((d) => d.hospitalId === selectedHospitalId)
    : allDoctors;

  const showHospital = !selectedHospitalId;

  return (
    <DashboardShell
      role="superadmin"
      userName={session.user.name}
      title="All Doctors"
      subtitle={selectedHospitalId ? 'Filtered by selected hospital' : 'Across every hospital on the platform'}
    >
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <p className="text-sm text-slate-500">
            {doctors.length} doctor{doctors.length !== 1 ? 's' : ''}
            {selectedHospitalId && <span className="text-slate-400"> (filtered)</span>}
          </p>
          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-700 transition"
          >
            <Plus className="w-4 h-4" /> Add Doctor
          </button>
        </div>
        {isLoading ? (
          <div className="py-16 text-center text-slate-400 text-sm">Loading…</div>
        ) : doctors.length === 0 ? (
          <div className="py-16 text-center">
            <Stethoscope className="w-16 h-16 text-slate-200 mx-auto mb-4" />
            <p className="text-slate-500">No doctors found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {showHospital && <th className="text-left py-3 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wide">Hospital</th>}
                  {['Name', 'Email', 'Specialization', 'Qualification', 'Experience'].map((h) => (
                    <th key={h} className="text-left py-3 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {doctors.map((d) => (
                  <tr key={d.id} className="border-b border-slate-50 hover:bg-slate-50 transition">
                    {showHospital && (
                      <td className="py-3 px-6">
                        <HospitalBadge hospitalId={d.hospitalId} hospitals={hospitals} />
                      </td>
                    )}
                    <td className="py-3 px-6 font-medium text-slate-900">{d.user?.name ?? '—'}</td>
                    <td className="py-3 px-6 text-slate-600 text-sm">{d.user?.email ?? '—'}</td>
                    <td className="py-3 px-6 text-slate-600">{d.specialization || '—'}</td>
                    <td className="py-3 px-6 text-slate-600">{d.qualification || '—'}</td>
                    <td className="py-3 px-6 text-slate-600">{d.experienceYears != null ? `${d.experienceYears} yrs` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AddDoctorModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={() => { refetch(); setModalOpen(false); }}
        preselectedHospitalId={selectedHospitalId}
        hospitals={hospitals}
      />
    </DashboardShell>
  );
}
