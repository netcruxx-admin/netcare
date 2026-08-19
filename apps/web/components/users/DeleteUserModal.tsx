'use client';

import { AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { apiError } from '@/lib/apiError';
import { useDeleteUserMutation } from '@/store/api';
import type { User } from '@/lib/types';

interface Props {
  /** User to delete. Pass null to close the modal. */
  user: User | null;
  onClose: () => void;
  onSuccess: () => void;
  /** Superadmin-only: routes the request to the correct tenant. */
  hospitalId?: string;
}

export function DeleteUserModal({ user, onClose, onSuccess, hospitalId }: Props) {
  const [deleteUser, { isLoading }] = useDeleteUserMutation();

  if (!user) return null;

  const handleDelete = async () => {
    try {
      await deleteUser({ id: user.id, hospitalId }).unwrap();
      toast.success('User deleted');
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(apiError(err, 'Failed to delete user'));
      onClose();
    }
  };

  return (
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
              <span className="font-semibold text-slate-900">{user.name}</span>? Any linked
              doctor or patient profile is removed too. This cannot be undone.
            </p>
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 px-4 py-2 bg-slate-200 text-slate-700 rounded hover:bg-slate-300 transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={isLoading}
            className="flex-1 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 font-semibold transition disabled:opacity-50"
          >
            {isLoading ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}
