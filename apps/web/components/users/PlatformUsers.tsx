'use client';

import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Users, Plus, AlertTriangle, Search, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { DashboardShell } from '@/components/DashboardShell';
import type { RoleViewProps } from '@/components/RoleView';
import { AddUserModal } from '@/components/superadmin/AddUserModal';
import { HospitalBadge } from '@/components/superadmin/HospitalBadge';
import { ActionIcon } from '@/components/ActionIcon';
import { TablePagination } from '@/components/TablePagination';
import { useServerTable } from '@/hooks/useServerTable';
import { apiError } from '@/lib/apiError';
import { hasPermission } from '@/lib/auth';
import type { User } from '@/lib/types';
import {
  useGetSuperadminUsersPagedQuery,
  useListHospitalsQuery,
  useListAssignableRolesQuery,
  useDeleteUserMutation,
} from '@/store/api';
import type { RoleOption } from '@/store/api';

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
  const [deleteError, setDeleteError] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');

  // Both filters go to the API, so the page count and the "(filtered)" total
  // describe the whole result rather than whatever arrived first.
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
  const [deleteUser] = useDeleteUserMutation();

  const roleOptions = useMemo(
    () => assignableRoles.map((r) => ({ value: r.code, label: r.label })),
    [assignableRoles],
  );

  const showHospital = !selectedHospitalId;

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteError('');
    try {
      await deleteUser({ id: deleting.id, hospitalId: deleting.hospitalId ?? undefined }).unwrap();
      setDeleting(null);
      refetch();
      toast.success('User deleted');
    } catch (err) {
      setDeleteError(apiError(err, 'Failed to delete user'));
    }
  };

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
          {hasPermission(session, 'users.manage') && (
            <button
              onClick={() => { setEditing(null); setModalOpen(true); }}
              className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-cyan-500 to-brand-teal text-white rounded-lg text-sm font-medium hover:shadow-lg transition"
            >
              <Plus className="w-4 h-4" /> Add User
            </button>
          )}
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
                      <td className="py-3 px-6 text-slate-500 text-sm">{u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—'}</td>
                      <td className="py-3 px-6 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {hasPermission(session, 'users.manage') && <ActionIcon icon={Pencil} label="Edit" onClick={() => { setEditing(u); setModalOpen(true); }} />}
                          {hasPermission(session, 'users.manage') && (isSelf ? (
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

      {/* Add / Edit modal — superadmin mode: hospitals prop enables hospital selector */}
      <AddUserModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        onSuccess={() => { refetch(); setModalOpen(false); setEditing(null); }}
        editing={editing}
        preselectedHospitalId={selectedHospitalId}
        hospitals={hospitals}
      />

      {/* Delete confirmation modal */}
      {deleting && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-2xl max-w-md w-full p-6">
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <div className="min-w-0">
                <h3 className="text-lg font-bold text-slate-900">Delete User</h3>
                <p className="text-slate-600 mt-1 text-sm">
                  Are you sure you want to delete{' '}
                  <span className="font-semibold text-slate-900">{deleting.name}</span>? Any linked
                  doctor or patient profile is removed too. This cannot be undone.
                </p>
              </div>
            </div>
            {deleteError && (
              <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{deleteError}</p>
            )}
            <div className="flex gap-3 mt-4">
              <button onClick={() => { setDeleting(null); setDeleteError(''); }} className="flex-1 px-4 py-2 bg-slate-200 text-slate-700 rounded hover:bg-slate-300 transition">
                Cancel
              </button>
              <button onClick={confirmDelete} className="flex-1 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 font-semibold transition">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
