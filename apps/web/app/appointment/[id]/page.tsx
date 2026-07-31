'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, CalendarPlus, Video } from 'lucide-react';
import Image from 'next/image';
import { FollowUpModal } from '@/components/FollowUpModal';
import { useAppointmentDetail } from './useAppointmentDetail';
import { ActionsToolbar } from './components/ActionsToolbar';
import { AppointmentInfo } from './components/AppointmentInfo';
import { ClinicalSections } from './components/ClinicalSections';
import { RescheduleModal } from './components/RescheduleModal';
import { EditAppointmentModal } from './components/EditAppointmentModal';
import { RecordVitalsModal } from './components/RecordVitalsModal';
import { AddPrescriptionModal } from './components/AddPrescriptionModal';
import { OrderTestModal } from './components/OrderTestModal';
import { ConfirmActionModal } from './components/ConfirmActionModal';
import { useActiveHospital } from '@/hooks/useActiveHospital';

type OpenModal = 'reschedule' | 'edit' | 'vitals' | 'rx' | 'laborder' | 'followup' | null;

// Reused page shell for the loading / error states.
function Chrome({ children }: { children: React.ReactNode }) {
  const hospital = useActiveHospital();
  return (
    <div className="min-h-screen bg-gradient-to-br from-cyan-50 via-white to-teal-50 flex flex-col">
      <div className="bg-white shadow-md border-b-2 border-cyan-100">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-3">
          <Image src="/logo/logo-full.png" alt={hospital.name} width={80} height={80} className="w-20 h-20 object-contain" />
        </div>
      </div>
      {children}
    </div>
  );
}

export default function AppointmentDetailPage() {
  const router = useRouter();
  const {
    appointmentId,
    loading,
    error,
    details,
    confirmAction,
    setConfirmAction,
    runConfirm,
    toast,
    flash,
    refreshAppointment,
    reloadDetails,
    doctorName,
    patientName,
    isPatient,
    isAdmin,
    canManage,
    canReschedule,
    canComplete,
    canCancel,
    medicineOptions,
  } = useAppointmentDetail();

  const [modal, setModal] = useState<OpenModal>(null);
  const closeModal = () => setModal(null);
  // Close a modal and refresh the page data with a toast.
  const afterSave = (msg: string) => {
    reloadDetails();
    closeModal();
    flash(msg);
  };

  if (loading) {
    return (
      <Chrome>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-12 h-12 rounded-full border-4 border-cyan-200 border-t-cyan-600 animate-spin mx-auto mb-4"></div>
            <p className="text-slate-600">Loading appointment details...</p>
          </div>
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-cyan-50 via-white to-teal-50">
      {/* Header */}
      <div className="bg-white shadow-md border-b-2 border-cyan-100">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Image src="/logo/logo-icon.png" alt="Logo" width={40} height={40} className="w-10 h-10 object-contain" />
            <h1 className="text-2xl font-bold bg-gradient-to-r from-cyan-600 to-teal-600 bg-clip-text text-transparent">
              Appointment Details
            </h1>
          </div>
          <button onClick={() => router.back()} className="flex items-center gap-2 text-cyan-600 hover:text-cyan-700">
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Appointment Status */}
        <div
          className={`mb-4 p-4 rounded-lg border-l-4 ${
            appointment.status === 'completed'
              ? 'bg-green-50 border-green-500'
              : appointment.status === 'cancelled'
              ? 'bg-red-50 border-red-500'
              : 'bg-blue-50 border-blue-500'
          }`}
        >
          <p className="text-sm font-semibold flex items-center gap-2 flex-wrap">
            <span>
              Status:{' '}
              <span
                className={
                  appointment.status === 'completed'
                    ? 'text-green-700'
                    : appointment.status === 'cancelled'
                    ? 'text-red-700'
                    : 'text-blue-700'
                }
              >
                {appointment.status.charAt(0).toUpperCase() + appointment.status.slice(1)}
              </span>
            </span>
            {appointment.mode === 'video' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-cyan-100 text-cyan-700">
                <Video className="w-3 h-3" /> Video consultation
              </span>
            )}
            {appointment.followUpOf && (
              <button
                onClick={() => router.push(`/appointment/${appointment.followUpOf}`)}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-cyan-100 text-cyan-700 hover:bg-cyan-200 transition"
                title="View the original appointment"
              >
                <CalendarPlus className="w-3 h-3" /> Follow-up · view original
              </button>
            )}
          </p>
        </div>

        <ActionsToolbar
          appointment={appointment}
          appointmentId={appointmentId}
          isPatient={isPatient}
          isAdmin={isAdmin}
          canManage={canManage}
          canReschedule={canReschedule}
          canComplete={canComplete}
          canCancel={canCancel}
          onEdit={() => setModal('edit')}
          onReschedule={() => setModal('reschedule')}
          onVitals={() => setModal('vitals')}
          onPrescription={() => setModal('rx')}
          onOrderTest={() => setModal('laborder')}
          onFollowUp={() => setModal('followup')}
          onConfirm={setConfirmAction}
        />

        <AppointmentInfo
          appointment={appointment}
          doctor={details.doctor}
          patient={details.patient}
          doctorName={doctorName}
          patientName={patientName}
        />

        <ClinicalSections
          prescriptions={details.prescriptions}
          vitals={details.vitals}
          medicalRecords={details.medicalRecords}
          testOrders={details.testOrders}
        />
      </div>

      {/* Modals */}
      {modal === 'reschedule' && (
        <RescheduleModal
          appointment={appointment}
          appointmentId={appointmentId}
          onClose={closeModal}
          onSaved={() => {
            refreshAppointment();
            closeModal();
          }}
        />
      )}

      {modal === 'edit' && (
        <EditAppointmentModal
          appointment={appointment}
          appointmentId={appointmentId}
          onClose={closeModal}
          onSaved={afterSave}
        />
      )}

      {modal === 'vitals' && (
        <RecordVitalsModal
          appointmentId={appointmentId}
          patientId={appointment.patientId}
          doctorId={appointment.doctorId}
          onClose={closeModal}
          onSaved={afterSave}
        />
      )}

      {modal === 'rx' && (
        <AddPrescriptionModal
          appointmentId={appointmentId}
          patientId={appointment.patientId}
          doctorId={appointment.doctorId}
          medicineOptions={medicineOptions}
          onClose={closeModal}
          onSaved={afterSave}
        />
      )}

      {modal === 'laborder' && (
        <OrderTestModal
          appointmentId={appointmentId}
          patientId={appointment.patientId}
          doctorId={appointment.doctorId}
          onClose={closeModal}
          onSaved={afterSave}
        />
      )}

      {confirmAction && (
        <ConfirmActionModal action={confirmAction} onCancel={() => setConfirmAction(null)} onConfirm={runConfirm} />
      )}

      {modal === 'followup' && (
        <FollowUpModal
          appointment={appointment}
          onClose={closeModal}
          onCreated={(msg) => {
            closeModal();
            flash(msg);
          }}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white text-sm px-4 py-2 rounded-lg shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
