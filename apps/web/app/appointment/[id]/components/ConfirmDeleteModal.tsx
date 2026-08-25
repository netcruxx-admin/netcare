'use client';

import { Trash2 } from 'lucide-react';
import { Modal } from './Modal';

interface Props {
  title: string;
  body: string;
  confirmLabel?: string;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmDeleteModal({
  title,
  body,
  confirmLabel = 'Delete',
  loading = false,
  onCancel,
  onConfirm,
}: Props) {
  return (
    <Modal>
      <div className="flex items-start gap-4">
        <div className="w-11 h-11 rounded-full bg-red-100 flex items-center justify-center shrink-0">
          <Trash2 className="w-6 h-6 text-red-600" />
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          <p className="text-slate-600 mt-1 text-sm">{body}</p>
        </div>
      </div>
      <div className="flex gap-3 mt-6">
        <button
          onClick={onCancel}
          disabled={loading}
          className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={loading}
          className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold transition disabled:opacity-50"
        >
          {loading ? 'Deleting…' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
