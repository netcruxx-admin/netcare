'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Globe, Plus, AlertTriangle, Search, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { DashboardShell } from '@/components/DashboardShell';
import type { RoleViewProps } from '@/components/RoleView';
import { DepartmentModal } from '@/components/departments/DepartmentModal';
import { HospitalBadge } from '@/components/superadmin/HospitalBadge';
import { ActionIcon } from '@/components/ActionIcon';
import { hasPermission } from '@/lib/auth';
import { apiError } from '@/lib/apiError';
import type { Department } from '@/lib/types';
import {
  useGetSuperadminDepartmentsQuery,
  useListHospitalsQuery,
  useDeleteDepartmentMutation,
} from '@/store/api';

export function PlatformDepartments({ session }: RoleViewProps) {
  const searchParams = useSearchParams();
  const selectedHospitalId = searchParams.get('h') ?? '';

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Department | null>(null);
  const [deleting, setDeleting] = useState<Department | null>(null);
  const [query, setQuery] = useState('');

  const { data: allDepartments = [], isLoading, refetch } = useGetSuperadminDepartmentsQuery();
  const { data: hospitals = [] } = useListHospitalsQuery();
  const [deleteDepartment] = useDeleteDepartmentMutation();

  const departments = allDepartments
    .filter((d) => !selectedHospitalId || d.hospitalId === selectedHospitalId)
    .filter((d) => {
      const q = query.trim().toLowerCase();
      return !q || d.name.toLowerCase().includes(q) || (d.description ?? '').toLowerCase().includes(q);
    });

  const showHospital = !selectedHospitalId;

  const openAdd = () => { setEditing(null); setModalOpen(true); };
  const openEdit = (d: Department) => { setEditing(d); setModalOpen(true); };
  const closeModal = () => { setModalOpen(false); setEditing(null); };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await deleteDepartment({ id: deleting.id, hospitalId: deleting.hospitalId }).unwrap();
      refetch();
      toast.success('Department deleted');
    } catch (err) {
      toast.error(apiError(err, 'Failed to delete department'));
    } finally {
      setDeleting(null);
    }
  };

  return (
    <DashboardShell
      role={session.user.role}
      userName={session.user.name}
      title="All Departments"
      subtitle={selectedHospitalId ? 'Filtered by selected hospital' : 'Across every hospital on the platform'}
    >
      {/* Search toolbar */}
      <div className="mb-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or description…"
            className="w-full pl-9 pr-3 py-2 bg-white rounded-lg shadow text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <p className="text-sm text-slate-500">
            {departments.length} department{departments.length !== 1 ? 's' : ''}
            {(selectedHospitalId || query) && <span className="text-slate-400"> (filtered)</span>}
          </p>
          {hasPermission(session, 'departments.manage') && (
            <button
              onClick={openAdd}
              className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-cyan-500 to-brand-teal text-white rounded-lg text-sm font-medium hover:shadow-lg transition"
            >
              <Plus className="w-4 h-4" /> Add Department
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="py-16 text-center text-slate-400 text-sm">Loading…</div>
        ) : departments.length === 0 ? (
          <div className="py-16 text-center">
            <Globe className="w-16 h-16 text-slate-200 mx-auto mb-4" />
            <p className="text-slate-500">No departments found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {showHospital && <th className="text-left py-3 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wide">Hospital</th>}
                  <th className="text-left py-3 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wide">Name</th>
                  <th className="text-left py-3 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wide">Description</th>
                  <th className="text-right py-3 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody>
                {departments.map((d) => (
                  <tr key={d.id} className="border-b border-slate-50 hover:bg-slate-50 transition">
                    {showHospital && (
                      <td className="py-3 px-6">
                        <HospitalBadge hospitalId={d.hospitalId} hospitals={hospitals} />
                      </td>
                    )}
                    <td className="py-3 px-6 font-medium text-slate-900">{d.name}</td>
                    <td className="py-3 px-6 text-slate-600 text-sm">{d.description || '—'}</td>
                    <td className="py-3 px-6 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {hasPermission(session, 'departments.manage') && <ActionIcon icon={Pencil} label="Edit" onClick={() => openEdit(d)} />}
                        {hasPermission(session, 'departments.manage') && <ActionIcon icon={Trash2} label="Delete" tone="danger" onClick={() => setDeleting(d)} />}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <DepartmentModal
        open={modalOpen}
        onClose={closeModal}
        onSuccess={() => { refetch(); closeModal(); }}
        editing={editing}
        hospitals={hospitals}
        preselectedHospitalId={selectedHospitalId}
      />

      {/* Delete confirmation */}
      {deleting && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-2xl max-w-md w-full p-6">
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <div className="min-w-0">
                <h3 className="text-lg font-bold text-slate-900">Delete Department</h3>
                <p className="text-slate-600 mt-1 text-sm">
                  Are you sure you want to delete{' '}
                  <span className="font-semibold text-slate-900">{deleting.name}</span>? This action
                  cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setDeleting(null)} className="flex-1 px-4 py-2 bg-slate-200 text-slate-700 rounded hover:bg-slate-300 transition">
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
