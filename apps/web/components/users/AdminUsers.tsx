'use client';

import { useMemo, useState } from 'react';
import { Plus, AlertTriangle, Search } from 'lucide-react';
import { apiError } from '@/lib/apiError';
import type { User } from '@/lib/types';
import { DashboardShell } from '@/components/DashboardShell';
import type { RoleViewProps } from '@/components/RoleView';
import { AddUserModal } from '@/components/superadmin/AddUserModal';
import { ExportButton } from '@/components/ExportButton';
import { TablePagination } from '@/components/TablePagination';
import { useServerTable } from '@/hooks/useServerTable';
import {
  useDeleteUserMutation,
  useLazyListUsersPagedQuery,
  useListAssignableRolesQuery,
  useListUsersPagedQuery,
} from '@/store/api';
import type { RoleOption } from '@/store/api';

// Badge colours for the roles that ship with the product. Roles added to the
// catalog later get the neutral fallback rather than an undefined class.
const roleStyle: Record<string, string> = {
  patient: 'bg-cyan-100 text-cyan-700',
  doctor: 'bg-green-100 text-green-700',
  admin: 'bg-purple-100 text-purple-700',
  lab: 'bg-amber-100 text-amber-700',
  nurse: 'bg-pink-100 text-pink-700',
};
const FALLBACK_ROLE_STYLE = 'bg-slate-100 text-slate-700';

// Stable empty default so the query's fallback doesn't change identity each
// render (it feeds a useMemo dependency below).
const EMPTY_ROLES: RoleOption[] = [];

export function AdminUsers({ session }: RoleViewProps) {
  const [editing, setEditing] = useState<User | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleting, setDeleting] = useState<User | null>(null);
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const table = useServerTable({ filterKey: roleFilter });

  // Role options come from the backend catalog, so a role a superadmin adds is
  // assignable here without a code change.
  const { data: assignableRoles = EMPTY_ROLES } = useListAssignableRolesQuery();
  const roleOptions = useMemo(
    () => assignableRoles.map((r) => ({ value: r.code, label: r.label })),
    [assignableRoles],
  );

  // Server-side throughout: the list is tenant-scoped, gated by users.read, and
  // searched, filtered and paged by the API.
  const listArgs = {
    q: table.q.trim() || undefined,
    role: roleFilter === 'all' ? undefined : roleFilter,
  };
  const { data: userPage, isLoading, error } = useListUsersPagedQuery({
    ...listArgs,
    limit: table.limit,
    offset: table.offset,
  });
  const filtered = userPage?.items ?? [];
  const totalUsers = userPage?.total ?? 0;
  const [fetchAllForExport] = useLazyListUsersPagedQuery();
  const [deleteUser] = useDeleteUserMutation();
  const [deleteError, setDeleteError] = useState('');

  const openAdd = () => { setEditing(null); setModalOpen(true); };
  const openEdit = (user: User) => { setEditing(user); setModalOpen(true); };
  const closeModal = () => { setModalOpen(false); setEditing(null); };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteError('');
    try {
      await deleteUser({ id: deleting.id }).unwrap();
      setDeleting(null);
    } catch (err) {
      setDeleteError(apiError(err, 'Failed to delete user'));
    }
  };


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
          // The whole filtered set, not the page on screen.
          getRows={async () => {
            const all = await fetchAllForExport(listArgs).unwrap();
            return all.items.map((u) => [u.name, u.email, u.phone ?? '', u.role]);
          }}
        />
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="flex justify-between items-center px-6 py-4 border-b">
          <h3 className="text-lg font-semibold text-slate-900">Users ({totalUsers})</h3>
          <button
            onClick={openAdd}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-500 to-brand-teal text-white rounded-lg hover:shadow-lg transition"
          >
            <Plus className="w-4 h-4" />
            Add User
          </button>
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
                  <td colSpan={5} className="py-10 text-center text-slate-400 text-sm">Loading…</td>
                </tr>
              )}
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-slate-500 text-sm">No users found.</td>
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
                      <button
                        onClick={() => openEdit(user)}
                        className="text-cyan-600 hover:text-cyan-700 font-semibold text-sm mr-4"
                      >
                        Edit
                      </button>
                      {isSelf ? (
                        <button className="text-slate-400 cursor-not-allowed font-semibold text-sm" disabled>
                          Delete
                        </button>
                      ) : (
                        <button
                          onClick={() => setDeleting(user)}
                          className="text-red-600 hover:text-red-700 font-semibold text-sm"
                        >
                          Delete
                        </button>
                      )}
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

      {/* Add / Edit modal — same component used by the platform (superadmin) screen,
          no hospitals prop = admin mode (no hospital selector, uses tenant-scoped mutations) */}
      <AddUserModal
        open={modalOpen}
        onClose={closeModal}
        onSuccess={() => { closeModal(); }}
        editing={editing}
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
              <button
                onClick={() => { setDeleting(null); setDeleteError(''); }}
                className="flex-1 px-4 py-2 bg-slate-200 text-slate-700 rounded hover:bg-slate-300 transition"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 font-semibold transition"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
