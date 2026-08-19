'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useCreateRoleMutation, useListPermissionsQuery, useUpdateRoleMutation } from '@/store/api';
import type { PermissionGrant, RoleInfo } from '@/store/api';
import { PermissionMatrix } from '@/components/roles/PermissionMatrix';

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  /** Present when editing; the code is then fixed (it is the PK users.role points at). */
  role: RoleInfo | null;
}

export function RoleModal({ open, onClose, onSuccess, role }: Props) {
  const isEdit = role !== null;
  const [code, setCode] = useState('');
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [isPlatform, setIsPlatform] = useState(false);
  const [sortOrder, setSortOrder] = useState('0');
  const [homePath, setHomePath] = useState('');
  const [permissions, setPermissions] = useState<PermissionGrant[]>([]);
  const [error, setError] = useState('');

  // The grantable catalog is backend-owned, so the matrix always reflects what
  // the platform actually supports.
  const { data: catalog = [] } = useListPermissionsQuery();

  const [createRole, { isLoading: creating }] = useCreateRoleMutation();
  const [updateRole, { isLoading: updating }] = useUpdateRoleMutation();
  const loading = creating || updating;

  // Reload the form whenever a different role is opened for editing.
  useEffect(() => {
    setCode(role?.code ?? '');
    setLabel(role?.label ?? '');
    setDescription(role?.description ?? '');
    setIsPlatform(role?.isPlatform ?? false);
    setSortOrder(String(role?.sortOrder ?? 0));
    setHomePath(role?.homePath ?? '');
    setPermissions(role?.permissions ?? []);
    setError('');
  }, [role, open]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isEdit && !code.trim()) { setError('Role code is required'); return; }
    if (!label.trim()) { setError('Display name is required'); return; }
    setError('');
    const body = {
      label: label.trim(),
      description: description.trim(),
      isPlatform,
      sortOrder: Number(sortOrder) || 0,
      homePath: homePath.trim(),
      // Sent with the role itself: creating a role and deciding what it can do
      // is one decision, so it is one request.
      permissions,
    };
    try {
      if (isEdit) {
        await updateRole({ code: role.code, body }).unwrap();
      } else {
        await createRole({ code: code.trim().toLowerCase(), ...body }).unwrap();
      }
      onSuccess();
    } catch (err) {
      const detail = (err as { data?: { detail?: string } }).data?.detail;
      setError(detail ?? 'Failed to save role');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 shrink-0">
          <h3 className="text-lg font-bold text-slate-900">{isEdit ? 'Edit Role' : 'Add Role'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-900 p-1"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
            {/* Row 1: Role Code + Display Name */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Role Code <span className="text-red-500">*</span></label>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  disabled={isEdit}
                  placeholder="e.g. pharmacist"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500 disabled:bg-slate-50 disabled:text-slate-500"
                />
                <p className="text-xs text-slate-400 mt-1">
                  {isEdit
                    ? 'The code is permanent — user accounts reference it.'
                    : 'Lowercase letters, digits, - or _. Stored on every user with this role.'}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Display Name <span className="text-red-500">*</span></label>
                <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Pharmacist" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500" />
              </div>
            </div>

            {/* Row 2: Description */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="What this role can do" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500 resize-none" />
            </div>

            {/* Row 3: Dashboard Path + Sort Order + Platform checkbox */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Dashboard Path</label>
                <input value={homePath} onChange={(e) => setHomePath(e.target.value)} placeholder="/dashboard" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500" />
                <p className="text-xs text-slate-400 mt-1">
                  Where users land after login. Leave blank for the generic dashboard.
                </p>
              </div>
              <div className="flex gap-3">
                <div className="w-28">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Sort Order</label>
                  <input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500" />
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-700 mt-7">
                  <input type="checkbox" checked={isPlatform} onChange={(e) => setIsPlatform(e.target.checked)} className="w-4 h-4" />
                  Platform-level role
                </label>
              </div>
            </div>

            {/* Permissions */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Permissions <span className="text-slate-400 font-normal">({permissions.length} selected)</span>
              </label>
              <p className="text-xs text-slate-400 mb-2">
                Everything this role may do. Nothing is implied by the role name — a
                role with no permissions can sign in and see nothing.
              </p>
              <div className="border border-slate-200 rounded-lg p-3">
                <PermissionMatrix
                  permissions={catalog}
                  granted={permissions}
                  onChange={setPermissions}
                  disabled={loading}
                />
              </div>
            </div>

            {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
          </div>

          {/* Sticky footer buttons */}
          <div className="flex gap-3 px-6 py-4 border-t border-slate-100 shrink-0">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 text-sm font-medium transition">Cancel</button>
            <button type="submit" disabled={loading} className="flex-1 px-4 py-2.5 bg-gradient-to-r from-cyan-500 to-brand-teal text-white rounded-lg text-sm font-semibold hover:shadow-lg transition disabled:opacity-50">
              {loading ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Role'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
