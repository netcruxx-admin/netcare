'use client';

// Data loading and mutations for the appointment detail page. The page renders
// from this.
//
// Access is no longer decided here. The API returns 404 for an appointment the
// caller isn't a party to (scope "own" is enforced server-side), so the checks
// this hook used to do against the mock store are gone — they compared the
// wrong data and could only ever hide the UI, not the records.
import { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { authStorage } from '@/lib/auth';
import { apiError } from '@/lib/apiError';
import {
  useDeleteAppointmentMutation,
  useGetAppointmentQuery,
  useGetDoctorQuery,
  useGetPatientQuery,
  useListMedicalRecordsQuery,
  useListMedicinesQuery,
  useListPrescriptionsQuery,
  useListTestOrdersQuery,
  useListTestResultsQuery,
  useListVitalsQuery,
  useUpdateAppointmentMutation,
} from '@/store/api';
import { today } from './appointmentSchemas';

export type ConfirmAction = null | 'complete' | 'cancel' | 'delete';

export function useAppointmentDetail() {
  const router = useRouter();
  const params = useParams();
  const appointmentId = params.id as string;

  const [session] = useState(() => authStorage.getSession());
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  };

  const {
    data: appointment,
    isLoading: loadingAppointment,
    error: appointmentError,
  } = useGetAppointmentQuery(appointmentId, { skip: !appointmentId });

  // Everything else hangs off the appointment, so it waits for it.
  const ready = Boolean(appointment);
  const { data: doctor } = useGetDoctorQuery(appointment?.doctorId ?? '', { skip: !ready });
  const { data: patient } = useGetPatientQuery(appointment?.patientId ?? '', { skip: !ready });
  const { data: prescriptions = [] } = useListPrescriptionsQuery({ appointmentId }, { skip: !ready });
  const { data: medicalRecords = [] } = useListMedicalRecordsQuery({ appointmentId }, { skip: !ready });
  const { data: vitals = [] } = useListVitalsQuery({ appointmentId }, { skip: !ready });
  const { data: orders = [] } = useListTestOrdersQuery({ appointmentId }, { skip: !ready });
  const { data: allResults = [] } = useListTestResultsQuery(undefined, { skip: !ready });

  const [updateAppointment] = useUpdateAppointmentMutation();
  const [deleteAppointment] = useDeleteAppointmentMutation();

  // Results are fetched once and attached to their order, rather than one
  // request per order.
  const testOrders = orders.map((order) => ({
    ...order,
    results: allResults.filter((result) => result.orderId === order.id),
  }));

  const details = {
    appointment: appointment ?? null,
    doctor: doctor ?? null,
    patient: patient ?? null,
    prescriptions,
    medicalRecords,
    vitals,
    testOrders,
  };

  const runConfirm = async () => {
    setError('');
    try {
      if (confirmAction === 'complete') {
        await updateAppointment({ id: appointmentId, body: { status: 'completed' } }).unwrap();
        flash('Appointment marked complete');
      } else if (confirmAction === 'cancel') {
        await updateAppointment({ id: appointmentId, body: { status: 'cancelled' } }).unwrap();
        flash('Appointment cancelled');
      } else if (confirmAction === 'delete') {
        await deleteAppointment(appointmentId).unwrap();
        setConfirmAction(null);
        router.back();
        return;
      }
    } catch (err) {
      setError(apiError(err, 'Could not update the appointment'));
    }
    setConfirmAction(null);
  };

  // Names come from the records themselves — DoctorOut/PatientOut embed the user.
  const doctorName = doctor?.user?.name ? `Dr. ${doctor.user.name}` : 'Doctor';
  const patientName = patient?.user?.name ?? 'Patient';

  const role = session?.user.role;
  const isPatient = role === 'patient';
  const isAdmin = role === 'admin';
  // A doctor reaching this page at all means the API accepted them as a party to
  // it, so "can manage" is about the UI's affordances rather than authorization.
  const isOwningDoctor = role === 'doctor';
  const canManage = isAdmin || isOwningDoctor;

  const isPast = !!appointment && appointment.date < today;
  const notCancelled = appointment?.status !== 'cancelled';
  const canReschedule =
    !!appointment && notCancelled && appointment.status !== 'completed' && (canManage || (isPatient && !isPast));
  const canComplete = canManage && appointment?.status === 'scheduled';
  const canCancel =
    !!appointment && notCancelled && appointment.status !== 'completed' && (canManage || (isPatient && !isPast));

  // Only prescribers need the medicine catalog, and only they can read it.
  const { data: medicines = [] } = useListMedicinesQuery(undefined, { skip: !canManage });
  const medicineOptions = medicines.map((m) => ({
    value: m.name,
    label: `${m.name}${m.strength ? ` — ${m.strength}` : ''}`,
  }));

  return {
    appointmentId,
    session,
    loading: loadingAppointment,
    error:
      error ||
      (appointmentError
        ? 'This appointment is not available to you.'
        : ''),
    details,
    confirmAction,
    setConfirmAction,
    runConfirm,
    toast,
    flash,
    // Mutations invalidate their cache tags, so the page refreshes itself.
    refreshAppointment: () => {},
    reloadDetails: () => {},
    doctorName,
    patientName,
    role,
    isPatient,
    isAdmin,
    canManage,
    canReschedule,
    canComplete,
    canCancel,
    medicineOptions,
  };
}
