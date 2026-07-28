'use client';

import { CheckCircle2, Trash2, XCircle } from 'lucide-react';
import { Modal } from './Modal';

type Action = 'complete' | 'cancel' | 'delete';

const COPY: Record<Action, { title: string; body: string; cta: string }> = {
  complete: { title: 'Mark as Complete', body: 'Mark this appointment as completed?', cta: 'Mark Complete' },
  cancel: { title: 'Cancel Appointment', body: 'Cancel this appointment? The slot will be freed.', cta: 'Cancel Visit' },
  delete: { title: 'Delete Appointment', body: 'Permanently delete this appointment? This cannot be undone.', cta: 'Delete' },
};

export function ConfirmActionModal({
  action,
  onCancel,
  onConfirm,
}: {
  action: Action;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const copy = COPY[action];

  return (
    <Modal>
      <div className="flex items-start gap-4">
        <div
          className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 ${
            action === 'complete' ? 'bg-green-100' : action === 'cancel' ? 'bg-amber-100' : 'bg-red-100'
          }`}
        >
          {action === 'complete' ? (
            <CheckCircle2 className="w-6 h-6 text-green-600" />
          ) : action === 'cancel' ? (
            <XCircle className="w-6 h-6 text-amber-600" />
          ) : (
            <Trash2 className="w-6 h-6 text-red-600" />
          )}
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-slate-900">{copy.title}</h2>
          <p className="text-slate-600 mt-1 text-sm">{copy.body}</p>
        </div>
      </div>
      <div className="flex gap-3 mt-6">
        <button
          onClick={onCancel}
          className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition"
        >
          Back
        </button>
        <button
          onClick={onConfirm}
          className={`flex-1 px-4 py-2 text-white rounded-lg font-semibold transition ${
            action === 'complete'
              ? 'bg-green-600 hover:bg-green-700'
              : action === 'cancel'
              ? 'bg-amber-600 hover:bg-amber-700'
              : 'bg-red-600 hover:bg-red-700'
          }`}
        >
          {copy.cta}
        </button>
      </div>
    </Modal>
  );
}
