'use client';

import { CalendarPlus, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

/**
 * Shown right after a patient is registered at the counter: offers to carry
 * straight on into booking an appointment for the patient who was just created,
 * rather than making the receptionist find them again from the list.
 */

interface Props {
  /** The patient just created. When empty the modal does not render. */
  patientName: string;
  /** Close without booking — the patient is already saved. */
  onSkip: () => void;
  /** Go to the booking screen with this patient pre-selected. */
  onBook: () => void;
}

export function BookAppointmentPrompt({ patientName, onSkip, onBook }: Props) {
  if (!patientName) return null;

  return (
    <Dialog open onOpenChange={(open) => !open && onSkip()}>
      <DialogContent className="max-w-md">
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-6 h-6 text-emerald-600" />
          </div>
          <div className="min-w-0">
            <DialogTitle className="text-lg font-bold text-slate-900">Patient added</DialogTitle>
            <p className="text-slate-600 mt-1 text-sm">
              <span className="font-semibold text-slate-900">{patientName}</span> has been
              registered. Would you like to book an appointment for them now?
            </p>
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button
            onClick={onSkip}
            className="flex-1 px-4 py-2 bg-slate-200 text-slate-700 rounded hover:bg-slate-300 transition text-sm font-medium"
          >
            Not now
          </button>
          <Button
            onClick={onBook}
            variant="brand"
            className="flex-1"
          >
            <CalendarPlus className="w-4 h-4" />
            Book appointment
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
