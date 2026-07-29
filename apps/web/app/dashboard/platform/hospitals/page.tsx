'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Building2, Plus } from 'lucide-react';
import { authStorage } from '@/lib/auth';
import { DashboardShell } from '@/components/DashboardShell';
import { OnboardHospitalModal } from '@/components/OnboardHospitalModal';
import { useListHospitalsQuery } from '@/store/api';

export default function PlatformHospitalsPage() {
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

  const { data: allHospitals = [], isLoading } = useListHospitalsQuery();

  if (!session) return null;

  const hospitals = selectedHospitalId
    ? allHospitals.filter((h) => h.id === selectedHospitalId)
    : allHospitals;

  return (
    <DashboardShell
      role="superadmin"
      userName={session.user.name}
      title="Hospitals"
      subtitle={selectedHospitalId ? `Showing 1 hospital` : 'All tenants on the NetCare platform'}
    >
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <p className="text-sm text-slate-500">
            {hospitals.length} hospital{hospitals.length !== 1 ? 's' : ''}
            {selectedHospitalId && <span className="text-slate-400"> (filtered)</span>}
          </p>
          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-700 transition"
          >
            <Plus className="w-4 h-4" /> Onboard Hospital
          </button>
        </div>

        {isLoading ? (
          <div className="py-16 text-center text-slate-400 text-sm">Loading…</div>
        ) : hospitals.length === 0 ? (
          <div className="py-16 text-center">
            <Building2 className="w-16 h-16 text-slate-200 mx-auto mb-4" />
            <p className="text-slate-500">No hospitals found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {['Name', 'Subdomain', 'Category', 'Theme', 'Status', 'Created'].map((h) => (
                    <th key={h} className="text-left py-3 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {hospitals.map((h) => (
                  <tr key={h.id} className="border-b border-slate-50 hover:bg-slate-50 transition">
                    <td className="py-3 px-6 font-medium text-slate-900">{h.name}</td>
                    <td className="py-3 px-6 font-mono text-sm text-slate-600">{h.subdomain}</td>
                    <td className="py-3 px-6 text-slate-600 capitalize">{h.category.replace('-', ' ')}</td>
                    <td className="py-3 px-6">
                      <div className="flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-full border border-slate-200 inline-block" style={{ background: (h.theme as Record<string, string>)?.primary ?? '#888' }} />
                        <span className="w-5 h-5 rounded-full border border-slate-200 inline-block" style={{ background: (h.theme as Record<string, string>)?.primaryDark ?? '#555' }} />
                      </div>
                    </td>
                    <td className="py-3 px-6">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${h.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
                        {h.status}
                      </span>
                    </td>
                    <td className="py-3 px-6 text-slate-500 text-sm">{new Date(h.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <OnboardHospitalModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </DashboardShell>
  );
}
