'use client';

import { useState } from 'react';
import { Plus, Building2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { DashboardShell } from '@/components/DashboardShell';
import type { RoleViewProps } from '@/components/RoleView';
import { DepartmentModal } from '@/components/departments/DepartmentModal';
import { useListDepartmentsQuery, useDeleteDepartmentMutation } from '@/store/api';
import type { Department } from '@/lib/types';

export function AdminDepartments({ session }: RoleViewProps) {
  const [editing, setEditing] = useState<Department | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleting, setDeleting] = useState<Department | null>(null);

  const { data: departments = [], refetch } = useListDepartmentsQuery();
  const [deleteDepartment] = useDeleteDepartmentMutation();

  const openAdd = () => { setEditing(null); setModalOpen(true); };
  const openEdit = (dept: Department) => { setEditing(dept); setModalOpen(true); };
  const closeModal = () => { setModalOpen(false); setEditing(null); };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await deleteDepartment({ id: deleting.id }).unwrap();
      toast.success('Department deleted');
    } catch {
      toast.error('Failed to delete department');
    } finally {
      setDeleting(null);
    }
  };

  return (
    <DashboardShell
      role={session.user.role}
      userName={session.user.name}
      title="Departments"
      subtitle="Manage hospital departments"
    >
      <div className="bg-white rounded-lg shadow">
        <div className="flex justify-between items-center px-6 py-4 border-b">
          <h3 className="text-lg font-semibold text-slate-900">Departments ({departments.length})</h3>
          <button
            onClick={openAdd}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-500 to-brand-teal text-white rounded-lg hover:shadow-lg transition"
          >
            <Plus className="w-4 h-4" />
            Add Department
          </button>
        </div>

        {departments.length === 0 ? (
          <div className="text-center py-16">
            <Building2 className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-600 mb-6">No departments yet</p>
            <button
              onClick={openAdd}
              className="inline-flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-cyan-500 to-brand-teal text-white rounded-lg hover:shadow-lg transition"
            >
              <Plus className="w-4 h-4" />
              Add Department
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-slate-50">
                  <th className="text-left py-3 px-6 font-semibold text-slate-900">Name</th>
                  <th className="text-left py-3 px-6 font-semibold text-slate-900">Description</th>
                  <th className="text-right py-3 px-6 font-semibold text-slate-900">Actions</th>
                </tr>
              </thead>
              <tbody>
                {departments.map((dept) => (
                  <tr key={dept.id} className="border-b hover:bg-slate-50">
                    <td className="py-3 px-6 font-medium">{dept.name}</td>
                    <td className="py-3 px-6 text-slate-600">{dept.description}</td>
                    <td className="py-3 px-6 text-right">
                      <button
                        onClick={() => openEdit(dept)}
                        className="text-cyan-600 hover:text-cyan-700 font-semibold text-sm mr-4"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setDeleting(dept)}
                        className="text-red-600 hover:text-red-700 font-semibold text-sm"
                      >
                        Delete
                      </button>
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
