'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import Image from 'next/image';
import { toast } from 'sonner';
import { useAppointmentDetail } from './useAppointmentDetail';
import { AppointmentDetailsCard } from './components/AppointmentDetailsCard';
import { VitalsSection } from './components/VitalsSection';
import { PrescriptionsSection } from './components/PrescriptionsSection';
import { ClinicalNotesSection } from './components/ClinicalNotesSection';
import { InjectionOrdersSection } from './components/InjectionOrdersSection';
import { LabOrdersSection } from './components/LabOrdersSection';
import { RescheduleModal } from '@/components/RescheduleModal';
import { FollowUpModal } from '@/components/FollowUpModal';
import { useActiveHospital } from '@/hooks/useActiveHospital';
import { Spinner } from '@/components/ui/spinner';
import { ageFromDob } from '@/lib/date';
import { formatRelationLine } from '@/components/patients/patientProfile';

// Reused page shell for the loading / error states.
function Chrome({ children }: { children: React.ReactNode }) {
  const hospital = useActiveHospital();
  return (
    <div className="min-h-screen bg-gradient-to-br from-cyan-50 via-white to-teal-50 flex flex-col">
      <div className="bg-white shadow-md border-b-2 border-cyan-100">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-3">
          {hospital.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={hospital.logoUrl} alt={hospital.name} className="w-20 h-20 object-contain" />
          ) : (
            <Image src="/logo/logo-full.png" alt={hospital.name} width={80} height={80} className="w-20 h-20 object-contain" />
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

// Everything about a visit lives on this one page, as one continuous flow of
// titled sections — no cards, no popups, and no click-to-reveal: every form
// that's usable is already open and ready to fill.
export default function AppointmentDetailPage() {
  const router = useRouter();
  const hospital = useActiveHospital();
  const { modules } = hospital;
  const {
    appointmentId,
    loading,
    error,
    details,
    confirmAction,
    setConfirmAction,
    runConfirm,
    patientName,
    canManage,
    canOrderInjection,
    canManageClinicalNotes,
    canDeletePrescription,
    canDeleteVitals,
    canDeleteTestOrder,
    canComplete,
    canCancel,
    canReschedule,
    canFollowUp,
    medicineOptions,
  } = useAppointmentDetail();
  const [showReschedule, setShowReschedule] = useState(false);
  const [showFollowUp, setShowFollowUp] = useState(false);

  if (loading) {
    return (
      <Chrome>
        <div className="flex-1 flex items-center justify-center">
          <Spinner variant="block" label="Loading appointment details…" />
        </div>
      </Chrome>
    );
  }

  if (error || !details.appointment) {
    return (
      <Chrome>
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="text-center">
            <p className="text-red-600 text-lg mb-4">{error || 'Appointment not found'}</p>
            <Link href="/dashboard" className="text-cyan-600 hover:text-cyan-700 flex items-center justify-center gap-2">
              <ArrowLeft className="w-4 h-4" />
              Back to Dashboard
            </Link>
          </div>
        </div>
      </Chrome>
    );
  }

  const appointment = details.appointment;
  const patient = details.patient;
  const relationLine = patient ? formatRelationLine(patient.relationType, patient.relationName) : '';
  const age = patient ? ageFromDob(patient.dateOfBirth) : null;
  const displayName = `${patientName}${age !== null ? ` (${age})` : ''}${relationLine ? ` ${relationLine}` : ''}`;
  const showActions =
    canComplete ||
    canCancel ||
    canReschedule ||
    canFollowUp ||
    (modules.telemedicine && appointment.mode === 'video' && appointment.status === 'scheduled');

  return (
    <div className="min-h-screen bg-gradient-to-br from-cyan-50 via-white to-teal-50">
      {/* Header — just the app chrome, nothing patient- or visit-specific */}
      <div className="bg-white shadow-md border-b-2 border-cyan-100">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          {hospital.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={hospital.logoUrl} alt={hospital.name} className="w-9 h-9 object-contain" />
          ) : (
            <Image src="/logo/logo-icon.png" alt="Logo" width={36} height={36} className="w-9 h-9 object-contain" />
          )}
          <button onClick={() => router.back()} className="flex items-center gap-2 text-cyan-600 hover:text-cyan-700 text-sm">
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
        </div>
      </div>

      {/* Main Content — one continuous document, no cards */}
      <div className="max-w-5xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between gap-4 flex-wrap mb-6">
          <div>
            <h1 className="text-xl font-bold text-slate-900 leading-tight">{displayName}</h1>
            <p className="text-xs text-slate-500">
              {new Date(appointment.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · {appointment.time}
            </p>
          </div>
          {showActions && (
            <AppointmentDetailsCard
              appointment={appointment}
              appointmentId={appointmentId}
              canComplete={canComplete}
              canCancel={canCancel}
              canReschedule={canReschedule}
              canFollowUp={canFollowUp}
              confirmAction={confirmAction}
              setConfirmAction={setConfirmAction}
              runConfirm={runConfirm}
              onReschedule={() => setShowReschedule(true)}
              onFollowUp={() => setShowFollowUp(true)}
            />
          )}
        </div>

        <div className="divide-y divide-slate-200">
          <div className="py-6">
            <ClinicalNotesSection
              appointmentId={appointmentId}
              patientId={appointment.patientId}
              doctorId={appointment.doctorId}
              record={details.medicalRecords[0] ?? null}
              canManage={canManageClinicalNotes}
              isNewVisit={appointment.visitType === 'new'}
            />
          </div>

          <div className="py-6">
            <VitalsSection
              vitals={details.vitals}
              appointmentId={appointmentId}
              patientId={appointment.patientId}
              doctorId={appointment.doctorId}
              canManage={canManage}
              canDelete={canDeleteVitals}
            />
          </div>

          {canOrderInjection && (
            <div className="py-6">
              <InjectionOrdersSection
                orders={details.injectionOrders}
                appointmentId={appointmentId}
                patientId={appointment.patientId}
                doctorId={appointment.doctorId}
                canManage={canOrderInjection}
              />
            </div>
          )}

          <div className="py-6">
            <PrescriptionsSection
              prescriptions={details.prescriptions}
              appointmentId={appointmentId}
              patientId={appointment.patientId}
              doctorId={appointment.doctorId}
              medicineOptions={medicineOptions}
              canManage={canManage}
              canDelete={canDeletePrescription}
            />
          </div>

          <div className="py-6">
            <LabOrdersSection
              testOrders={details.testOrders}
              appointmentId={appointmentId}
              patientId={appointment.patientId}
              doctorId={appointment.doctorId}
              canOrder={canManage && modules.lab}
              canDelete={canDeleteTestOrder}
            />
          </div>
        </div>
      </div>

      {showReschedule && (
        <RescheduleModal
          appointment={appointment}
          onClose={() => setShowReschedule(false)}
          onRescheduled={(message) => {
            setShowReschedule(false);
            toast.success(message);
          }}
        />
      )}

      {showFollowUp && (
        <FollowUpModal
          appointment={appointment}
          onClose={() => setShowFollowUp(false)}
          onCreated={(message) => {
            setShowFollowUp(false);
            toast.success(message);
          }}
        />
      )}
    </div>
  );
}
