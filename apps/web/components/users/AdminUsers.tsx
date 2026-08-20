'use client';

import { useMemo, useState } from 'react';
import { Users, Plus, Search, Pencil, Trash2, Eye } from 'lucide-react';
import { DashboardShell } from '@/components/DashboardShell';
import type { RoleViewProps } from '@/components/RoleView';
import { AddUserModal } from '@/components/superadmin/AddUserModal';
import { DeleteUserModal } from '@/components/users/DeleteUserModal';
import { ActionIcon } from '@/components/ActionIcon';
import { RecordDialog } from '@/components/RecordDialog';
import { fmtDate } from '@/lib/date';
import { ExportButton } from '@/components/ExportButton';
import { TablePagination } from '@/components/TablePagination';
import { useServerTable } from '@/hooks/useServerTable';
import { hasPermission } from '@/lib/auth';
import type { User } from '@/lib/types';
import {
  useLazyListUsersPagedQuery,
  useListAssignableRolesQuery,
  useListUsersPagedQuery,
} from '@/store/api';
import type { RoleOption } from '@/store/api';

// Badge colours for the roles that ship with the product.
const roleStyle: Record<string, string> = {
  patient: 'bg-cyan-100 text-cyan-700',
  doctor: 'bg-green-100 text-green-700',
  admin: 'bg-purple-100 text-purple-700',
  lab: 'bg-amber-100 text-amber-700',
  nurse: 'bg-pink-100 text-pink-700',
};
const FALLBACK_ROLE_STYLE = 'bg-slate-100 text-slate-700';

const EMPTY_ROLES: RoleOption[] = [];

export function AdminUsers({ session }: RoleViewProps) {
  const [editing, setEditing] = useState<User | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleting, setDeleting] = useState<User | null>(null);
  const [viewing, setViewing] = useState<User | null>(null);
  const [roleFilter, setRoleFilter] = useState<string>('all');

  const canManage = hasPermission(session, 'users.manage');

  const table = useServerTable({ filterKey: roleFilter });

  const { data: assignableRoles = EMPTY_ROLES } = useListAssignableRolesQuery();
  const roleOptions = useMemo(
    () => assignableRoles.map((r) => ({ value: r.code, label: r.label })),
    [assignableRoles],
  );

  const listArgs = {
    q: table.q.trim() || undefined,
    role: roleFilter === 'all' ? undefined : roleFilter,
  };
  const { data: userPage, isLoading, error, refetch } = useListUsersPagedQuery({
    ...listArgs,
    limit: table.limit,
    offset: table.offset,
  });
  const filtered = userPage?.items ?? [];
  const totalUsers = userPage?.total ?? 0;
  const [fetchAllForExport] = useLazyListUsersPagedQuery();

  const openAdd = () => { setEditing(null); setModalOpen(true); };
  const openEdit = (user: User) => { setEditing(user); setModalOpen(true); };
  const closeModal = () => { setModalOpen(false); setEditing(null); };

  return (
    <DashboardShell
      role={session.user.role}
      userName={session.user.name}
      title="System Users"
      subtitle="Monitor users and their roles"
    >
      {error && (
        <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          Could not load users.
        </p>
      )}

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-md">
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
        <ExportButton
          filename="users"
          headers={['Name', 'Email', 'Phone', 'Role']}
          rows={filtered.map((u) => [u.name, u.email, u.phone ?? '', u.role])}
          getRows={async () => {
            const all = await fetchAllForExport(listArgs).unwrap();
            return all.items.map((u) => [u.name, u.email, u.phone ?? '', u.role]);
          }}
        />
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="flex justify-between items-center px-6 py-4 border-b">
          <h3 className="text-lg font-semibold text-slate-900">Users ({totalUsers})</h3>
          {canManage && (
            <button
              onClick={openAdd}
              className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-cyan-500 to-brand-teal text-white rounded-lg text-sm font-medium hover:shadow-lg transition"
            >
              <Plus className="w-4 h-4" />
              Add User
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-slate-50">
                <th className="text-left py-3 px-6 font-semibold text-slate-900">Name</th>
                <th className="text-left py-3 px-6 font-semibold text-slate-900">Email</th>
                <th className="text-left py-3 px-6 font-semibold text-slate-900">Phone</th>
                <th className="text-left py-3 px-6 font-semibold text-slate-900">Role</th>
                <th className="text-right py-3 px-6 font-semibold text-slate-900">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={canManage ? 5 : 4} className="py-10 text-center text-slate-400 text-sm">Loading…</td>
                </tr>
              )}
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={canManage ? 5 : 4} className="py-10 text-center">
                    <Users className="w-12 h-12 text-slate-300 mx-auto mb-2" />
                    <p className="text-slate-500 text-sm">No users found.</p>
                  </td>
                </tr>
              )}
              {filtered.map((user) => {
                const isSelf = user.id === session.user.id;
                return (
                  <tr key={user.id} className="border-b hover:bg-slate-50">
                    <td className="py-3 px-6 font-medium">
                      {user.name}
                      {isSelf && <span className="ml-2 text-xs text-slate-400">(you)</span>}
                    </td>
                    <td className="py-3 px-6 text-slate-600">{user.email}</td>
                    <td className="py-3 px-6 text-slate-600">{user.phone || '—'}</td>
                    <td className="py-3 px-6">
                      <span className={`inline-block px-3 py-1 rounded-full text-sm capitalize ${roleStyle[user.role] ?? FALLBACK_ROLE_STYLE}`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="py-3 px-6 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <ActionIcon icon={Eye} label="View" onClick={() => setViewing(user)} />
                        {canManage && (
                          <>
                            <ActionIcon icon={Pencil} label="Edit" onClick={() => openEdit(user)} />
                            {isSelf ? (
                              <span className="p-2 text-slate-300 cursor-not-allowed" title="Cannot delete yourself">
                                <Trash2 className="w-4 h-4" />
                              </span>
                            ) : (
                              <ActionIcon icon={Trash2} label="Delete" tone="danger" onClick={() => setDeleting(user)} />
                            )}
                          </>
                        )}
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
      </div>

      <AddUserModal
        open={modalOpen}
        onClose={closeModal}
        onSuccess={() => { refetch(); closeModal(); }}
        editing={editing}
      />
      <DeleteUserModal
        user={deleting}
        onClose={() => setDeleting(null)}
        onSuccess={refetch}
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
          { label: 'Created', value: viewing?.createdAt ? fmtDate(viewing.createdAt) : '' },
          { label: 'User ID', value: viewing?.id },
        ]}
      />
    </DashboardShell>
  );
}
