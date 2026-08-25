'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, CalendarPlus, Video } from 'lucide-react';
import Image from 'next/image';
import { toast } from 'sonner';
import { FollowUpModal } from '@/components/FollowUpModal';
import { useAppointmentDetail } from './useAppointmentDetail';
import { ActionsToolbar } from './components/ActionsToolbar';
import { AppointmentInfo } from './components/AppointmentInfo';
import { ClinicalSections } from './components/ClinicalSections';
import { RescheduleModal } from './components/RescheduleModal';
import { EditAppointmentModal } from './components/EditAppointmentModal';
import { RecordVitalsModal } from './components/RecordVitalsModal';
import { EditVitalsModal } from './components/EditVitalsModal';
import { AddPrescriptionModal } from './components/AddPrescriptionModal';
import { EditPrescriptionModal } from './components/EditPrescriptionModal';
import { AddClinicalNotesModal } from './components/AddClinicalNotesModal';
import { OrderTestModal } from './components/OrderTestModal';
import { ConfirmActionModal } from './components/ConfirmActionModal';
import { ConfirmDeleteModal } from './components/ConfirmDeleteModal';
import { useActiveHospital } from '@/hooks/useActiveHospital';
import {
  useDeletePrescriptionMutation,
  useCancelTestOrderMutation,
  useDeleteVitalsMutation,
} from '@/store/api';

type OpenModal = 'reschedule' | 'edit' | 'vitals' | 'edit-vitals' | 'rx' | 'edit-rx' | 'notes' | 'laborder' | 'followup' | null;

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
  const [editRx, setEditRx] = useState<any>(null);
  const [editVitals, setEditVitals] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    type: 'rx' | 'vitals' | 'order';
    id: string;
    title: string;
    body: string;
    confirmLabel: string;
  } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const closeModal = () => { setModal(null); setEditRx(null); setEditVitals(null); };
  // Close a modal and refresh the page data with a toast.
  const afterSave = (msg: string) => {
    reloadDetails();
    closeModal();
    toast.success(msg);
  };

  const [deletePrescription] = useDeletePrescriptionMutation();
  const [cancelTestOrder] = useCancelTestOrderMutation();
  const [deleteVitals] = useDeleteVitalsMutation();

  const handleDeletePrescription = (id: string) => {
    setDeleteTarget({
      type: 'rx', id,
      title: 'Delete Prescription',
      body: 'This will also remove the pending pharmacy order. This cannot be undone.',
      confirmLabel: 'Delete Prescription',
    });
  };

  const handleCancelTestOrder = (id: string) => {
    setDeleteTarget({
      type: 'order', id,
      title: 'Cancel Lab Order',
      body: 'Cancel this lab order? If the lab has already started processing it, cancellation will be blocked.',
      confirmLabel: 'Cancel Order',
    });
  };

  const handleDeleteVitals = (id: string) => {
    setDeleteTarget({
      type: 'vitals', id,
      title: 'Delete Vitals',
      body: 'Permanently delete this vitals record? This cannot be undone.',
      confirmLabel: 'Delete Vitals',
    });
  };

  const runDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      if (deleteTarget.type === 'rx') {
        await deletePrescription(deleteTarget.id).unwrap();
        toast.success('Prescription deleted');
      } else if (deleteTarget.type === 'order') {
        await cancelTestOrder(deleteTarget.id).unwrap();
        toast.success('Lab order cancelled');
      } else {
        await deleteVitals(deleteTarget.id).unwrap();
        toast.success('Vitals deleted');
      }
      setDeleteTarget(null);
    } catch (err: any) {
      toast.error(err?.data?.detail ?? 'Could not complete the action');
      setDeleteTarget(null);
    } finally {
      setDeleteLoading(false);
    }
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
            <h1 className="text-2xl font-bold bg-gradient-to-r from-cyan-600 to-brand-teal bg-clip-text text-transparent">
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
          onClinicalNotes={() => setModal('notes')}
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
          canManage={canManage}
          onEditPrescription={(rx) => { setEditRx(rx); setModal('edit-rx'); }}
          onDeletePrescription={handleDeletePrescription}
          onEditVitals={(v) => { setEditVitals(v); setModal('edit-vitals'); }}
          onDeleteVitals={handleDeleteVitals}
          onDeleteTestOrder={handleCancelTestOrder}
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

      {modal === 'notes' && (
        <AddClinicalNotesModal
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

      {modal === 'edit-rx' && editRx && (
        <EditPrescriptionModal
          prescription={editRx}
          medicineOptions={medicineOptions}
          onClose={closeModal}
          onSaved={afterSave}
        />
      )}

      {modal === 'edit-vitals' && editVitals && (
        <EditVitalsModal
          vitals={editVitals}
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

      {deleteTarget && (
        <ConfirmDeleteModal
          title={deleteTarget.title}
          body={deleteTarget.body}
          confirmLabel={deleteTarget.confirmLabel}
          loading={deleteLoading}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={runDelete}
        />
      )}

      {modal === 'followup' && (
        <FollowUpModal
          appointment={appointment}
          onClose={closeModal}
          onCreated={(msg) => {
            closeModal();
            toast.success(msg);
          }}
        />
      )}

    </div>
  );
}
