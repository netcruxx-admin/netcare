'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Users, Plus } from 'lucide-react';
import { DashboardShell } from '@/components/DashboardShell';
import type { RoleViewProps } from '@/components/RoleView';
import { AddUserModal } from '@/components/superadmin/AddUserModal';
import { HospitalBadge } from '@/components/superadmin/HospitalBadge';
import { useGetSuperadminUsersQuery, useListHospitalsQuery } from '@/store/api';

const ROLE_STYLES: Record<string, string> = {
  admin: 'bg-violet-100 text-violet-700',
  doctor: 'bg-blue-100 text-blue-700',
  nurse: 'bg-emerald-100 text-emerald-700',
  lab: 'bg-amber-100 text-amber-700',
  patient: 'bg-slate-100 text-slate-600',
};

export function PlatformUsers({ session }: RoleViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedHospitalId = searchParams.get('h') ?? '';

  const [modalOpen, setModalOpen] = useState(false);

  const { data: allUsers = [], isLoading, refetch } = useGetSuperadminUsersQuery();
  const { data: hospitals = [] } = useListHospitalsQuery();

  const users = selectedHospitalId
    ? allUsers.filter((u) => u.hospitalId === selectedHospitalId)
    : allUsers;

  const showHospital = !selectedHospitalId;

  return (
    <DashboardShell
      role={session.user.role}
      userName={session.user.name}
      title="All Users"
      subtitle={selectedHospitalId ? 'Filtered by selected hospital' : 'Every staff account across all hospitals'}
    >
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <p className="text-sm text-slate-500">
            {users.length} user{users.length !== 1 ? 's' : ''}
            {selectedHospitalId && <span className="text-slate-400"> (filtered)</span>}
          </p>
          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-700 transition"
          >
            <Plus className="w-4 h-4" /> Add User
          </button>
        </div>
        {isLoading ? (
          <div className="py-16 text-center text-slate-400 text-sm">Loading…</div>
        ) : users.length === 0 ? (
          <div className="py-16 text-center">
            <Users className="w-16 h-16 text-slate-200 mx-auto mb-4" />
            <p className="text-slate-500">No users found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {showHospital && <th className="text-left py-3 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wide">Hospital</th>}
                  {['Name', 'Email', 'Role', 'Phone', 'Joined'].map((h) => (
                    <th key={h} className="text-left py-3 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-slate-50 hover:bg-slate-50 transition">
                    {showHospital && (
                      <td className="py-3 px-6">
                        <HospitalBadge hospitalId={u.hospitalId} hospitals={hospitals} />
                      </td>
                    )}
                    <td className="py-3 px-6 font-medium text-slate-900">{u.name}</td>
                    <td className="py-3 px-6 text-slate-600 text-sm">{u.email}</td>
                    <td className="py-3 px-6">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${ROLE_STYLES[u.role] ?? 'bg-slate-100 text-slate-600'}`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="py-3 px-6 text-slate-600 text-sm">{u.phone ?? '—'}</td>
                    <td className="py-3 px-6 text-slate-500 text-sm">{u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AddUserModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={() => { refetch(); setModalOpen(false); }}
        preselectedHospitalId={selectedHospitalId}
        hospitals={hospitals}
      />
    </DashboardShell>
  );
}
