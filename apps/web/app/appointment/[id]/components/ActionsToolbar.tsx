'use client';

import { useRouter } from 'next/navigation';
import {
  Activity,
  CalendarClock,
  CalendarPlus,
  CheckCircle2,
  Pencil,
  Pill,
  FlaskConical,
  Trash2,
  Video,
  XCircle,
} from 'lucide-react';
import type { Appointment } from '@/lib/types';
import { getEnabledModules } from '@/lib/hospitalCategories';
import type { ConfirmAction } from '../useAppointmentDetail';

interface ActionsToolbarProps {
  appointment: Appointment;
  appointmentId: string;
  isPatient: boolean;
  isAdmin: boolean;
  canManage: boolean;
  canReschedule: boolean;
  canComplete: boolean;
  canCancel: boolean;
  onEdit: () => void;
  onReschedule: () => void;
  onVitals: () => void;
  onPrescription: () => void;
  onOrderTest: () => void;
  onFollowUp: () => void;
  onConfirm: (action: ConfirmAction) => void;
}

const secondaryBtn =
  'inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition font-semibold text-sm';

export function ActionsToolbar({
  appointment,
  appointmentId,
  isPatient,
  isAdmin,
  canManage,
  canReschedule,
  canComplete,
  canCancel,
  onEdit,
  onReschedule,
  onVitals,
  onPrescription,
  onOrderTest,
  onFollowUp,
  onConfirm,
}: ActionsToolbarProps) {
  const router = useRouter();

  return (
    <div className="mb-8 flex flex-wrap gap-2">
      {getEnabledModules().telemedicine && appointment.mode === 'video' && appointment.status === 'scheduled' && (isPatient || canManage) && (
        <button
          onClick={() => router.push(`/dashboard/consult/${appointmentId}`)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-500 to-brand-teal text-white rounded-lg hover:shadow-lg transition font-semibold text-sm"
        >
          <Video className="w-4 h-4" /> Join Video Consult
        </button>
      )}
      {canManage && (
        <button onClick={onEdit} className={secondaryBtn}>
          <Pencil className="w-4 h-4" /> Edit
        </button>
      )}
      {canReschedule && (
        <button onClick={onReschedule} className={secondaryBtn}>
          <CalendarClock className="w-4 h-4" /> Reschedule
        </button>
      )}
      {canManage && (
        <>
          <button onClick={onVitals} className={secondaryBtn}>
            <Activity className="w-4 h-4" /> Record Vitals
          </button>
          <button onClick={onPrescription} className={secondaryBtn}>
            <Pill className="w-4 h-4" /> Add Prescription
          </button>
          {getEnabledModules().lab && (
            <button onClick={onOrderTest} className={secondaryBtn}>
              <FlaskConical className="w-4 h-4" /> Order Test
            </button>
          )}
          <button onClick={onFollowUp} className={secondaryBtn}>
            <CalendarPlus className="w-4 h-4" /> Follow-Up
          </button>
        </>
      )}
      {canComplete && (
        <button
          onClick={() => onConfirm('complete')}
          className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-semibold text-sm"
        >
          <CheckCircle2 className="w-4 h-4" /> Mark Complete
        </button>
      )}
      {canCancel && (
        <button
          onClick={() => onConfirm('cancel')}
          className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-amber-300 text-amber-700 rounded-lg hover:bg-amber-50 transition font-semibold text-sm"
        >
          <XCircle className="w-4 h-4" /> Cancel Visit
        </button>
      )}
      {isAdmin && (
        <button
          onClick={() => onConfirm('delete')}
          className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition font-semibold text-sm"
        >
          <Trash2 className="w-4 h-4" /> Delete
        </button>
      )}
    </div>
  );
}
