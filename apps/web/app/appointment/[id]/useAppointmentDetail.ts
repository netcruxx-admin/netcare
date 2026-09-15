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
import { authStorage, hasPermission } from '@/lib/auth';
import { apiError } from '@/lib/apiError';
import {
  useDeleteAppointmentMutation,
  useGetAppointmentQuery,
  useGetPatientQuery,
  useListInjectionOrdersQuery,
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
  const { data: patient } = useGetPatientQuery(appointment?.patientId ?? '', { skip: !ready });
  const { data: prescriptions = [] } = useListPrescriptionsQuery({ appointmentId }, { skip: !ready });
  const { data: medicalRecords = [] } = useListMedicalRecordsQuery({ appointmentId }, { skip: !ready });
  const { data: vitals = [] } = useListVitalsQuery({ appointmentId }, { skip: !ready });
  const { data: orders = [] } = useListTestOrdersQuery({ appointmentId }, { skip: !ready });
  const { data: injectionOrders = [] } = useListInjectionOrdersQuery({ appointmentId }, { skip: !ready });
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
    patient: patient ?? null,
    prescriptions,
    medicalRecords,
    vitals,
    testOrders,
    injectionOrders,
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

  // The name comes from the record itself — PatientOut embeds the user.
  const patientName = patient?.user?.name ?? 'Patient';

  const role = session?.user.role;
  const isPatient = role === 'patient';
  const isAdmin = role === 'admin';
  // A doctor reaching this page at all means the API accepted them as a party to
  // it, so "can manage" is about the UI's affordances rather than authorization.
  const isOwningDoctor = role === 'doctor';
  const canManage = isAdmin || isOwningDoctor;

  // Deletion split off from canManage: clinical staff amend their records, the
  // platform owner is the one who can erase them. Each row is its own
  // capability because each hits a different endpoint. See x9y0z1a2b3c4.
  const canDeletePrescription = hasPermission(session, 'prescriptions.delete');
  const canDeleteVitals = hasPermission(session, 'vitals.delete');
  const canDeleteTestOrder = hasPermission(session, 'lab_orders.delete');
  // Ordering a shot is its own grant — a role can prescribe without it, or
  // hold it without prescribing — so it is not folded into canManage.
  const canOrderInjection = canManage && hasPermission(session, 'injection_orders.manage');
  // Writing a diagnosis is the doctor's, not the admin's — admin holds no
  // medical_records.manage, so the clinical-notes button is gated on the real
  // grant rather than on canManage (which an admin passes).
  const canManageClinicalNotes = canManage && hasPermission(session, 'medical_records.manage');

  const isPast = !!appointment && appointment.date < today;
  const notCancelled = appointment?.status !== 'cancelled';
  // Rescheduling PUTs the appointment, which needs appointments.manage —
  // canManage-only, unlike cancel below. A patient can cancel their own
  // upcoming booking (appointments.create/read scope "own" covers that
  // through cancel's own endpoint) but never holds appointments.manage, so a
  // reschedule button offered to them would only ever 403.
  const canReschedule = !!appointment && notCancelled && appointment.status !== 'completed' && canManage;
  const canComplete = canManage && appointment?.status === 'scheduled';
  const canCancel =
    !!appointment && notCancelled && appointment.status !== 'completed' && (canManage || (isPatient && !isPast));
  // Unlike the appointment boards' Schedule Follow-Up action (offered
  // regardless of status), this detail page only offers it once the visit
  // this appointment represents has actually happened — booking the next
  // visit before this one is even done doesn't fit "follow-up".
  const canFollowUp = canManage && appointment?.status === 'completed';

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
    patientName,
    role,
    isPatient,
    isAdmin,
    canManage,
    canOrderInjection,
    canManageClinicalNotes,
    canDeletePrescription,
    canDeleteVitals,
    canDeleteTestOrder,
    canReschedule,
    canComplete,
    canCancel,
    canFollowUp,
    medicineOptions,
  };
}
