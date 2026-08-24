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
import { toast } from 'sonner';
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
  // Only the results belonging to this appointment's orders — the endpoint
  // takes a comma-separated list, so it stays one request.
  const orderIds = orders.map((o) => o.id).join(',');
  const { data: allResults = [] } = useListTestResultsQuery(
    { orderId: orderIds },
    { skip: !ready || !orderIds },
  );

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
    try {
      if (confirmAction === 'complete') {
        await updateAppointment({ id: appointmentId, body: { status: 'completed' } }).unwrap();
        toast.success('Appointment marked complete');
        // Back to the list: a finished consultation is done being looked at,
        // and the next one is on that page. `push` rather than `back()` — the
        // route here may have been reached from a patient chart or a search,
        // and "complete" should land somewhere predictable either way.
        setConfirmAction(null);
        router.push('/dashboard/appointments');
        return;
      } else if (confirmAction === 'cancel') {
        await updateAppointment({ id: appointmentId, body: { status: 'cancelled' } }).unwrap();
        toast.success('Appointment cancelled');
      } else if (confirmAction === 'delete') {
        await deleteAppointment({ id: appointmentId }).unwrap();
        setConfirmAction(null);
        router.back();
        return;
      }
    } catch (err) {
      toast.error(apiError(err, 'Could not update the appointment'));
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
    error: appointmentError ? 'This appointment is not available to you.' : '',
    details,
    confirmAction,
    setConfirmAction,
    runConfirm,
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
