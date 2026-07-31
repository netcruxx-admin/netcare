'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { DashboardShell } from '@/components/DashboardShell';
import type { RoleViewProps } from '@/components/RoleView';
import { RoleModal } from '@/components/superadmin/RoleModal';
import { useDeleteRoleMutation, useListRolesQuery } from '@/store/api';
import type { RoleInfo } from '@/store/api';
import { builtInRoleCodes } from '@/lib/roles';


export function PlatformRoles({ session }: RoleViewProps) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<RoleInfo | null>(null);
  const [error, setError] = useState('');

  const { data: roles = [], isLoading } = useListRolesQuery();
  const [deleteRole] = useDeleteRoleMutation();

  const openCreate = () => { setEditing(null); setError(''); setModalOpen(true); };
  const openEdit = (role: RoleInfo) => { setEditing(role); setError(''); setModalOpen(true); };

  const handleDelete = async (role: RoleInfo) => {
    if (!confirm(`Delete the "${role.label}" role? This cannot be undone.`)) return;
    setError('');
    try {
      await deleteRole(role.code).unwrap();
    } catch (err) {
      const detail = (err as { data?: { detail?: string } }).data?.detail;
      setError(detail ?? 'Failed to delete role');
    }
  };

  return (
    <DashboardShell
      role={session.user.role}
      userName={session.user.name}
      title="Roles"
      subtitle="The platform-wide role catalog every hospital draws from"
    >
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <p className="text-sm text-slate-500">
            {roles.length} role{roles.length !== 1 ? 's' : ''}
          </p>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-700 transition"
          >
            <Plus className="w-4 h-4" /> Add Role
          </button>
        </div>

        {error && (
          <p className="mx-6 mt-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
        )}

        {isLoading ? (
          <div className="py-16 text-center text-slate-400 text-sm">Loading…</div>
        ) : roles.length === 0 ? (
          <div className="py-16 text-center">
            <ShieldCheck className="w-16 h-16 text-slate-200 mx-auto mb-4" />
            <p className="text-slate-500">No roles defined.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {['Code', 'Display Name', 'Permissions', 'Scope', 'Users', ''].map((h) => (
                    <th key={h} className="text-left py-3 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {roles.map((r) => {
                  const builtin = builtInRoleCodes.includes(r.code);
                  const locked = builtin || r.userCount > 0;
                  return (
                    <tr key={r.code} className="border-b border-slate-50 hover:bg-slate-50 transition">
                      <td className="py-3 px-6">
                        <code className="text-xs bg-slate-100 text-slate-700 rounded px-2 py-1">{r.code}</code>
                      </td>
                      <td className="py-3 px-6">
                        <span className="font-medium text-slate-900">{r.label}</span>
                        {r.description && <span className="block text-xs text-slate-500">{r.description}</span>}
                      </td>
                      <td className="py-3 px-6 text-sm">
                        {r.permissions.length > 0 ? (
                          <span
                            className="text-slate-700"
                            title={r.permissions.map((p) => p.scope ? `${p.code} (${p.scope})` : p.code).join('\n')}
                          >
                            {r.permissions.length} granted
                          </span>
                        ) : (
                          <span className="text-amber-600" title="This role can sign in but see nothing">none</span>
                        )}
                      </td>
                      <td className="py-3 px-6 text-sm">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${r.isPlatform ? 'bg-violet-50 text-violet-700' : 'bg-slate-100 text-slate-600'}`}>
                          {r.isPlatform ? 'Platform' : 'Hospital'}
                        </span>
                      </td>
                      <td className="py-3 px-6 text-slate-600 text-sm">{r.userCount}</td>
                      <td className="py-3 px-6">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEdit(r)}
                            title="Edit role"
                            className="p-1.5 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded transition"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(r)}
                            disabled={locked}
                            title={
                              builtin
                                ? 'Built-in roles cannot be deleted'
                                : r.userCount > 0
                                  ? 'Role is assigned to users'
                                  : 'Delete role'
                            }
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition disabled:opacity-30 disabled:hover:text-slate-400 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <RoleModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={() => setModalOpen(false)}
        role={editing}
      />
    </DashboardShell>
  );
}
