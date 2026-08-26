'use client';

import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Users, Plus, Search, Pencil, Trash2, Eye } from 'lucide-react';
import { DashboardShell } from '@/components/DashboardShell';
import type { RoleViewProps } from '@/components/RoleView';
import { AddUserModal } from '@/components/superadmin/AddUserModal';
import { DeleteUserModal } from '@/components/users/DeleteUserModal';
import { HospitalBadge } from '@/components/superadmin/HospitalBadge';
import { ActionIcon } from '@/components/ActionIcon';
import { RecordDialog } from '@/components/RecordDialog';
import { TablePagination } from '@/components/TablePagination';
import { useServerTable } from '@/hooks/useServerTable';
import { hasPermission } from '@/lib/auth';
import { fmtDate } from '@/lib/date';
import type { User } from '@/lib/types';
import {
  useGetSuperadminUsersPagedQuery,
  useListHospitalsQuery,
  useListAssignableRolesQuery,
} from '@/store/api';
import type { RoleOption } from '@/store/api';
import { Spinner } from '@/components/ui/spinner';

const ROLE_STYLES: Record<string, string> = {
  admin: 'bg-violet-100 text-violet-700',
  doctor: 'bg-blue-100 text-blue-700',
  nurse: 'bg-emerald-100 text-emerald-700',
  lab: 'bg-amber-100 text-amber-700',
  patient: 'bg-slate-100 text-slate-600',
};

const EMPTY_ROLES: RoleOption[] = [];

export function PlatformUsers({ session }: RoleViewProps) {
  const searchParams = useSearchParams();
  const selectedHospitalId = searchParams.get('h') ?? '';

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [deleting, setDeleting] = useState<User | null>(null);
  const [viewing, setViewing] = useState<User | null>(null);
  const [roleFilter, setRoleFilter] = useState('all');

  const table = useServerTable({ filterKey: `${selectedHospitalId}|${roleFilter}` });
  const { data: userPage, isLoading, refetch } = useGetSuperadminUsersPagedQuery({
    q: table.q.trim() || undefined,
    hospitalId: selectedHospitalId || undefined,
    role: roleFilter === 'all' ? undefined : roleFilter,
    limit: table.limit,
    offset: table.offset,
  });
  const users = userPage?.items ?? [];
  const totalUsers = userPage?.total ?? 0;
  const { data: hospitals = [] } = useListHospitalsQuery();
  const { data: assignableRoles = EMPTY_ROLES } = useListAssignableRolesQuery();

  const roleOptions = useMemo(
    () => assignableRoles.map((r) => ({ value: r.code, label: r.label })),
    [assignableRoles],
  );

  const showHospital = !selectedHospitalId;
  const canManage = hasPermission(session, 'users.manage');
  // Deletion is a platform capability: see migration x9y0z1a2b3c4.
  const canDelete = hasPermission(session, 'users.delete');

  return (
    <DashboardShell
      role={session.user.role}
      userName={session.user.name}
      title="All Users"
      subtitle={selectedHospitalId ? 'Filtered by selected hospital' : 'Every staff account across all hospitals'}
    >
      {/* Search & filter toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={table.search}
            onChange={(e) => table.setSearch(e.target.value)}
            placeholder="Search name, email or phone…"
            className="w-full pl-9 pr-3 py-2 bg-white rounded-lg shadow text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="bg-white rounded-lg shadow px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-500"
        >
          <option value="all">All Roles</option>
          {roleOptions.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <p className="text-sm text-slate-500">
            {totalUsers} user{totalUsers !== 1 ? 's' : ''}
            {(selectedHospitalId || table.search || roleFilter !== 'all') && <span className="text-slate-400"> (filtered)</span>}
          </p>
          {canManage && (
            <button
              onClick={() => { setEditing(null); setModalOpen(true); }}
              className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-cyan-500 to-brand-teal text-white rounded-lg text-sm font-medium hover:shadow-lg transition"
            >
              <Plus className="w-4 h-4" /> Add User
            </button>
          )}
        </div>
        {isLoading ? (
          <Spinner variant="block" />
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
                  <th className="text-right py-3 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isSelf = u.id === session.user.id;
                  return (
                    <tr key={u.id} className="border-b border-slate-50 hover:bg-slate-50 transition">
                      {showHospital && (
                        <td className="py-3 px-6">
                          <HospitalBadge hospitalId={u.hospitalId} hospitals={hospitals} />
                        </td>
                      )}
                      <td className="py-3 px-6 font-medium text-slate-900">
                        {u.name}
                        {isSelf && <span className="ml-2 text-xs text-slate-400">(you)</span>}
                      </td>
                      <td className="py-3 px-6 text-slate-600 text-sm">{u.email}</td>
                      <td className="py-3 px-6">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${ROLE_STYLES[u.role] ?? 'bg-slate-100 text-slate-600'}`}>
                          {u.role}
                        </span>
                      </td>
                      <td className="py-3 px-6 text-slate-600 text-sm">{u.phone ?? '—'}</td>
                      <td className="py-3 px-6 text-slate-500 text-sm">{fmtDate(u.createdAt)}</td>
                      <td className="py-3 px-6 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <ActionIcon icon={Eye} label="View" onClick={() => setViewing(u)} />
                          {canManage && <ActionIcon icon={Pencil} label="Edit" onClick={() => { setEditing(u); setModalOpen(true); }} />}
                          {canDelete && (isSelf ? (
                            <span className="p-2 text-slate-300 cursor-not-allowed" title="Cannot delete yourself">
                              <Trash2 className="w-4 h-4" />
                            </span>
                          ) : (
                            <ActionIcon icon={Trash2} label="Delete" tone="danger" onClick={() => setDeleting(u)} />
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <TablePagination
              page={table.page}
              pageSize={table.pageSize}
              total={totalUsers}
              onPageChange={table.setPage}
            />
          </div>
        )}
      </div>

      <AddUserModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        onSuccess={() => { refetch(); setModalOpen(false); setEditing(null); }}
        editing={editing}
        preselectedHospitalId={selectedHospitalId}
        hospitals={hospitals}
      />
      <DeleteUserModal
        user={deleting}
        onClose={() => setDeleting(null)}
        onSuccess={refetch}
        hospitalId={deleting?.hospitalId ?? undefined}
      />
      <RecordDialog
        open={viewing !== null}
        onClose={() => setViewing(null)}
        title={viewing?.name ?? ''}
        subtitle={viewing?.email}
        fields={[
          { label: 'Name', value: viewing?.name },
          { label: 'Email', value: viewing?.email },
          { label: 'Phone', value: viewing?.phone },
          { label: 'Role', value: viewing?.role },
          {
            label: 'Hospital',
            value: hospitals.find((h) => h.id === viewing?.hospitalId)?.name ?? viewing?.hospitalId,
          },
          { label: 'Created', value: viewing?.createdAt ? fmtDate(viewing.createdAt) : '' },
          { label: 'User ID', value: viewing?.id },
        ]}
      />
    </DashboardShell>
  );
}
