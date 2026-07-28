'use client';

// Data loading, access control and mutations for the appointment detail page.
// Loads the appointment + related clinical records, enforces role-based view
// permissions, derives which actions the current user may take, and exposes the
// confirm/complete/cancel/delete handlers. The page renders from this.
import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { authStorage } from '@/lib/auth';
import { dbOperations, Appointment, Doctor, Patient, Medicine } from '@/lib/db';
import { today } from './appointmentSchemas';

interface AppointmentDetails {
  appointment: Appointment | null;
  doctor: Doctor | null;
  patient: Patient | null;
  prescriptions: any[];
  medicalRecords: any[];
  vitals: any[];
  testOrders: any[];
}

// A test order plus any published results for it, for the detail view.
function loadTestOrders(appointmentId: string) {
  return dbOperations.getTestOrdersByAppointment(appointmentId).map((order) => ({
    ...order,
    results: dbOperations.getTestResultsByOrderId(order.id),
  }));
}

export type ConfirmAction = null | 'complete' | 'cancel' | 'delete';

export function useAppointmentDetail() {
  const router = useRouter();
  const params = useParams();
  const appointmentId = params.id as string;

  const [session, setSession] = useState<ReturnType<typeof authStorage.getSession>>(null);
  const [loading, setLoading] = useState(true);
  const [details, setDetails] = useState<AppointmentDetails>({
    appointment: null,
    doctor: null,
    patient: null,
    prescriptions: [],
    medicalRecords: [],
    vitals: [],
    testOrders: [],
  });
  const [error, setError] = useState('');
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [toast, setToast] = useState('');

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  };

  useEffect(() => {
    const session = authStorage.getSession();
    if (!session) {
      router.push('/login');
    } else {
      setSession(session);
    }
  }, [router]);

  useEffect(() => {
    if (!appointmentId) return;

    try {
      const appointment = dbOperations.getAppointment(appointmentId);
      if (!appointment) {
        setError('Appointment not found');
        setLoading(false);
        return;
      }

      // Verify access - patient can only see their own, doctor can see their own, admin can see all
      if (session?.user.role === 'patient' && appointment.patientId !== dbOperations.getPatientByUserId(session.user.id)?.id) {
        setError('You do not have permission to view this appointment');
        setLoading(false);
        return;
      }

      if (session?.user.role === 'doctor' && appointment.doctorId !== dbOperations.getDoctorByUserId(session.user.id)?.id) {
        setError('You do not have permission to view this appointment');
        setLoading(false);
        return;
      }

      const doctor = dbOperations.getDoctor(appointment.doctorId);
      const patient = dbOperations.getPatient(appointment.patientId);
      const prescriptions = dbOperations.getPrescriptionsByAppointment(appointmentId);
      const medicalRecords = dbOperations.getMedicalRecordsByAppointment(appointmentId);
      const vitals = dbOperations.getVitalsByAppointment(appointmentId);
      const testOrders = loadTestOrders(appointmentId);

      setDetails({
        appointment,
        doctor: doctor ?? null,
        patient: patient ?? null,
        prescriptions,
        medicalRecords,
        vitals,
        testOrders,
      });
    } catch (err) {
      setError('Error loading appointment details');
      console.error('[v0] Error:', err);
    } finally {
      setLoading(false);
    }
  }, [appointmentId, session]);

  const refreshAppointment = () => {
    const updated = dbOperations.getAppointment(appointmentId);
    if (updated) setDetails((prev) => ({ ...prev, appointment: updated }));
  };

  const reloadDetails = () => {
    const a = dbOperations.getAppointment(appointmentId);
    if (!a) return;
    setDetails({
      appointment: a,
      doctor: dbOperations.getDoctor(a.doctorId) ?? null,
      patient: dbOperations.getPatient(a.patientId) ?? null,
      prescriptions: dbOperations.getPrescriptionsByAppointment(appointmentId),
      medicalRecords: dbOperations.getMedicalRecordsByAppointment(appointmentId),
      vitals: dbOperations.getVitalsByAppointment(appointmentId),
      testOrders: loadTestOrders(appointmentId),
    });
  };

  const runConfirm = () => {
    if (confirmAction === 'complete') {
      dbOperations.updateAppointment(appointmentId, { status: 'completed' });
      reloadDetails();
      flash('Appointment marked complete');
    } else if (confirmAction === 'cancel') {
      dbOperations.updateAppointment(appointmentId, { status: 'cancelled' });
      reloadDetails();
      flash('Appointment cancelled');
    } else if (confirmAction === 'delete') {
      dbOperations.deleteAppointment(appointmentId);
      setConfirmAction(null);
      router.back();
      return;
    }
    setConfirmAction(null);
  };

  // Derived view data + permissions. Safe to compute while still loading — the
  // appointment-dependent flags fall back to false until it's present.
  const { appointment, doctor, patient } = details;
  const doctorUser = doctor ? dbOperations.getUserById(doctor.userId) : null;
  const patientUser = patient ? dbOperations.getUserById(patient.userId) : null;
  const doctorName = doctorUser ? `Dr. ${doctorUser.name}` : 'Doctor';
  const patientName = patientUser?.name ?? 'Patient';

  const role = session?.user.role;
  const isPatient = role === 'patient';
  const isAdmin = role === 'admin';
  const myDoctorId = role === 'doctor' && session ? dbOperations.getDoctorByUserId(session.user.id)?.id : null;
  const isOwningDoctor = role === 'doctor' && appointment?.doctorId === myDoctorId;
  // Doctors (their own) and admins can clinically manage the visit.
  const canManage = isAdmin || isOwningDoctor;

  const isPast = !!appointment && appointment.date < today;
  const notCancelled = appointment?.status !== 'cancelled';
  const canReschedule =
    !!appointment && notCancelled && appointment.status !== 'completed' && (canManage || (isPatient && !isPast));
  const canComplete = canManage && appointment?.status === 'scheduled';
  const canCancel =
    !!appointment && notCancelled && appointment.status !== 'completed' && (canManage || (isPatient && !isPast));

  const medicineOptions = dbOperations.getAllMedicines().map((m: Medicine) => ({
    value: m.name,
    label: `${m.name}${m.strength ? ` — ${m.strength}` : ''}`,
  }));

  return {
    // ids / raw
    appointmentId,
    session,
    loading,
    error,
    details,
    // confirm + toast
    confirmAction,
    setConfirmAction,
    runConfirm,
    toast,
    flash,
    // mutations
    refreshAppointment,
    reloadDetails,
    // derived
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
