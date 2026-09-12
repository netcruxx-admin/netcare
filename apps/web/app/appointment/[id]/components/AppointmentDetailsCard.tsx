'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Video, XCircle } from 'lucide-react';
import type { Appointment } from '@/lib/types';
import { useActiveHospital } from '@/hooks/useActiveHospital';
import type { ConfirmAction } from '../useAppointmentDetail';
import { InlineConfirmBar } from './InlineConfirm';
import { Button } from '@/components/ui/button';

const CONFIRM_COPY: Partial<Record<Exclude<ConfirmAction, null>, { label: string; body: string; tone: string }>> = {
  complete: { label: 'Mark Complete', body: 'Mark this appointment as completed?', tone: 'bg-green-600 hover:bg-green-700' },
  cancel: { label: 'Mark Cancelled', body: 'Cancel this appointment? The slot will be freed.', tone: 'bg-amber-600 hover:bg-amber-700' },
};

interface Props {
  appointment: Appointment;
  appointmentId: string;
  canComplete: boolean;
  canCancel: boolean;
  confirmAction: ConfirmAction;
  setConfirmAction: (a: ConfirmAction) => void;
  runConfirm: () => Promise<void>;
}

// Compact by design: just the two actions a doctor actually reaches for
// while finishing a visit, plus the video-join link when there's a call to
// join. Date, status, and reason are already visible in the page header and
// each clinical section — this bar isn't the place to re-edit them.
export function AppointmentDetailsCard({
  appointment,
  appointmentId,
  canComplete,
  canCancel,
  confirmAction,
  setConfirmAction,
  runConfirm,
}: Props) {
  const router = useRouter();
  const { modules } = useActiveHospital();
  const [confirmLoading, setConfirmLoading] = useState(false);

  const confirm = async () => {
    setConfirmLoading(true);
    try {
      await runConfirm();
    } finally {
      setConfirmLoading(false);
    }
  };

  const copy = confirmAction ? CONFIRM_COPY[confirmAction] : undefined;

  if (!canComplete && !canCancel && !(modules.telemedicine && appointment.mode === 'video' && appointment.status === 'scheduled')) {
    return null;
  }

  return (
    <div>
      {copy ? (
        <InlineConfirmBar
          message={copy.body}
          confirmLabel={copy.label}
          tone={copy.tone}
          loading={confirmLoading}
          onConfirm={confirm}
          onCancel={() => setConfirmAction(null)}
        />
      ) : (
        <div className="flex flex-wrap gap-2">
          {modules.telemedicine && appointment.mode === 'video' && appointment.status === 'scheduled' && (
            <Button
              onClick={() => router.push(`/dashboard/consult/${appointmentId}`)}
              variant="brand"
              size="sm"
            >
              <Video className="w-4 h-4" /> Join Video Consult
            </Button>
          )}
          {canComplete && (
            <button
              onClick={() => setConfirmAction('complete')}
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-semibold text-sm"
            >
              <CheckCircle2 className="w-4 h-4" /> Mark Complete
            </button>
          )}
          {canCancel && (
            <button
              onClick={() => setConfirmAction('cancel')}
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-amber-300 text-amber-700 rounded-lg hover:bg-amber-50 transition font-semibold text-sm"
            >
              <XCircle className="w-4 h-4" /> Mark Cancelled
            </button>
          )}
        </div>
      )}
    </div>
  );
}
