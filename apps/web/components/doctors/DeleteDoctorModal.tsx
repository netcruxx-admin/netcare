'use client';

import { AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { apiError } from '@/lib/apiError';
import { useDeleteDoctorMutation } from '@/store/api';
import type { Doctor } from '@/lib/types';
import { Spinner } from '@/components/ui/spinner';

interface Props {
  /** Doctor to delete. Pass null to close the modal. */
  doctor: Doctor | null;
  onClose: () => void;
  onSuccess: () => void;
  /** Superadmin-only: routes the request to the correct tenant. */
  hospitalId?: string;
}

export function DeleteDoctorModal({ doctor, onClose, onSuccess, hospitalId }: Props) {
  const [deleteDoctor, { isLoading }] = useDeleteDoctorMutation();

  if (!doctor) return null;

  const handleDelete = async () => {
    try {
      await deleteDoctor({ id: doctor.id, hospitalId }).unwrap();
      toast.success('Doctor deleted');
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(apiError(err, 'Failed to delete doctor'));
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
            <h3 className="text-lg font-bold text-slate-900">Delete Doctor</h3>
            <p className="text-slate-600 mt-1 text-sm">
              Are you sure you want to delete{' '}
              <span className="font-semibold text-slate-900">{doctor.user?.name ?? 'this doctor'}</span>?
              Their account, appointments, and records will be permanently removed. This cannot be undone.
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
            className="inline-flex items-center justify-center gap-2 flex-1 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 font-semibold transition disabled:opacity-50"
          >
            {isLoading ? <Spinner size="sm" label="Deleting…" /> : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}
