'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Building2, Users, UserRound, Stethoscope, CalendarDays, LayoutDashboard, Plus } from 'lucide-react';
import { DashboardShell } from '@/components/DashboardShell';
import type { RoleViewProps } from '@/components/RoleView';
import { OnboardHospitalWizard } from '@/components/hospitals/OnboardHospitalWizard';
// import { OnboardHospitalModal } from '@/components/OnboardHospitalModal';
import { hasPermission } from '@/lib/auth';
import { fmtDate } from '@/lib/date';
import { useGetSuperadminOverviewQuery, useListHospitalsQuery } from '@/store/api';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

export function PlatformOverview({ session }: RoleViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedHospitalId = searchParams.get('h') ?? '';

  const [modalOpen, setModalOpen] = useState(false);

  const { data: overview } = useGetSuperadminOverviewQuery(selectedHospitalId || undefined);
  const { data: allHospitals = [], isLoading } = useListHospitalsQuery();

  const hospitals = selectedHospitalId
    ? allHospitals.filter((h) => h.id === selectedHospitalId)
    : allHospitals;

  const stats = [
    { label: 'Hospitals', value: overview?.hospitals ?? '—', icon: Building2, color: 'bg-slate-100 text-slate-700' },
    { label: 'Users', value: overview?.users ?? '—', icon: Users, color: 'bg-blue-50 text-blue-700' },
    { label: 'Patients', value: overview?.patients ?? '—', icon: UserRound, color: 'bg-emerald-50 text-emerald-700' },
    { label: 'Doctors', value: overview?.doctors ?? '—', icon: Stethoscope, color: 'bg-violet-50 text-violet-700' },
    { label: 'Appointments', value: overview?.appointments ?? '—', icon: CalendarDays, color: 'bg-amber-50 text-amber-700' },
    { label: 'Departments', value: overview?.departments ?? '—', icon: LayoutDashboard, color: 'bg-rose-50 text-rose-700' },
  ];

  return (
    <DashboardShell
      role={session.user.role}
      userName={session.user.name}
      title="Platform Overview"
      subtitle={selectedHospitalId ? `Showing: ${hospitals[0]?.name ?? '…'}` : 'All hospitals across NetCare'}
    >
      <div className="space-y-8">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {stats.map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.label} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 flex flex-col gap-2">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${s.color}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <p className="text-2xl font-bold text-slate-900">{s.value}</p>
                <p className="text-xs text-slate-500">{s.label}</p>
              </div>
            );
          })}
        </div>

        {/* Hospitals table */}
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
            <h2 className="font-semibold text-slate-900">
              Hospitals {selectedHospitalId && <span className="text-sm font-normal text-slate-400">(filtered)</span>}
            </h2>
            {hasPermission(session, 'hospitals.manage') && (
              <Button
                onClick={() => setModalOpen(true)}
                variant="brand"
                size="sm"
              >
                <Plus className="w-4 h-4" /> Onboard Hospital
              </Button>
            )}
          </div>
          {isLoading ? (
            <Spinner variant="block" />
          ) : hospitals.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-sm">No hospitals found.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 border-b border-slate-100">
                    {['Name', 'Subdomain', 'Category', 'Theme', 'Status', 'Created'].map((h) => (
                      <TableHead key={h} className="text-left py-3 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {hospitals.map((h) => (
                    <TableRow key={h.id} className="border-b border-slate-50 hover:bg-slate-50 transition">
                      <TableCell className="py-3 px-6 font-medium text-slate-900 whitespace-normal">{h.name}</TableCell>
                      <TableCell className="py-3 px-6 font-mono text-sm text-slate-600 whitespace-normal">{h.subdomain}</TableCell>
                      <TableCell className="py-3 px-6 text-slate-600 capitalize whitespace-normal">{h.category.replace('-', ' ')}</TableCell>
                      <TableCell className="py-3 px-6 whitespace-normal">
                        <div className="flex items-center gap-1.5">
                          <span className="w-5 h-5 rounded-full border border-slate-200 inline-block" style={{ background: (h.theme as Record<string, string>)?.primary ?? '#888' }} />
                          <span className="w-5 h-5 rounded-full border border-slate-200 inline-block" style={{ background: (h.theme as Record<string, string>)?.primaryDark ?? '#555' }} />
                        </div>
                      </TableCell>
                      <TableCell className="py-3 px-6 whitespace-normal">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${h.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
                          {h.status}
                        </span>
                      </TableCell>
                      <TableCell className="py-3 px-6 text-slate-500 text-sm whitespace-normal">{fmtDate(h.createdAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>

      <OnboardHospitalWizard open={modalOpen} onClose={() => setModalOpen(false)} />
    </DashboardShell>
  );
}
