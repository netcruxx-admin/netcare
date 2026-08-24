'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import { CheckCircle, AlertCircle, Banknote, CreditCard, Loader2 } from 'lucide-react';
import type { Doctor } from '@/lib/types';
import { apiError } from '@/lib/apiError';
import { blockedSlotSet } from '@/lib/schedule';
import { useHospitalSlots } from '@/hooks/useBreakSlots';
import {
  useCreateAppointmentMutation,
  useCreatePaymentMutation,
  useGetDoctorAvailabilityQuery,
  useInitiatePaymentMutation,
  useListDoctorsQuery,
  useListPatientsQuery,
  useVerifyPaymentMutation,
} from '@/store/api';
import { DashboardShell } from '@/components/DashboardShell';
import type { RoleViewProps } from '@/components/RoleView';
import { FormField } from '@/components/form/FormField';
import { Calendar } from '@/components/ui/calendar';

// ---------------------------------------------------------------------------
// Razorpay script loader (same helper as PatientBook)
// ---------------------------------------------------------------------------

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open(): void; close(): void };
  }
}

function loadRazorpayScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window !== 'undefined' && window.Razorpay) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load payment gateway. Check your internet connection.'));
    document.body.appendChild(script);
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toDateStr(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function slotToMinutes(slot: string) {
  const [t, mer] = slot.split(' ');
  let [h, m] = t.split(':').map(Number);
  if (mer === 'PM' && h !== 12) h += 12;
  if (mer === 'AM' && h === 12) h = 0;
  return h * 60 + m;
}

const today = toDateStr(new Date());


type SlotStatus = 'available' | 'booked' | 'blocked';

function slotStatus(slot: string, date: string, booked: Set<string>, blocked: Set<string>, breakSlots: Set<string>): SlotStatus {
  if (breakSlots.has(slot) || blocked.has(slot)) return 'blocked';
  if (date === today) {
    const now = new Date();
    if (slotToMinutes(slot) <= now.getHours() * 60 + now.getMinutes()) return 'blocked';
  }
  if (booked.has(slot)) return 'booked';
  return 'available';
}

function departmentForDoctor(doctors: Doctor[], doctorId: string) {
  return doctors.find((d) => d.id === doctorId)?.departmentId ?? '';
}

function feeForDoctor(doctors: Doctor[], doctorId: string): number {
  return doctors.find((d) => d.id === doctorId)?.consultationFee ?? 0;
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const bookingSchema = Yup.object({
  patientId: Yup.string().required('Select a patient'),
  doctorId: Yup.string().required('Select a doctor'),
  date: Yup.string().required('Pick a date'),
  time: Yup.string().required('Select a time slot'),
  reason: Yup.string(),
});

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function AdminBookForm({ session }: RoleViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [submitError, setSubmitError] = useState('');
  const [success, setSuccess] = useState(false);
  const [paymentMode, setPaymentMode] = useState<'cash' | 'online'>('cash');
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'initiating' | 'checkout' | 'verifying'>('idle');

  const { data: patients = [] } = useListPatientsQuery();
  const { data: doctors = [] } = useListDoctorsQuery();
  const [createAppointment] = useCreateAppointmentMutation();
  const [createPayment] = useCreatePaymentMutation();
  const [initiatePayment] = useInitiatePaymentMutation();
  const [verifyPayment] = useVerifyPaymentMutation();

  // Prefill from query params (e.g. when arriving from a Schedule board slot)
  const prefill = {
    patientId: '',
    doctorId: searchParams.get('doctor') ?? '',
    date: searchParams.get('date') ?? '',
    time: searchParams.get('time') ?? '',
    reason: '',
  };

  // Mirrors the form's doctor/date so the availability query — which is a hook,
  // and so cannot live inside Formik's render prop — can react to them.
  const [selection, setSelection] = useState({
    doctorId: prefill.doctorId,
    date: prefill.date,
  });
  const { data: availability } = useGetDoctorAvailabilityQuery(
    { doctorId: selection.doctorId, date: selection.date },
    { skip: !selection.doctorId || !selection.date },
  );
  const bookedSet = new Set(availability?.taken ?? []);
  const { slots: SLOTS, breakSlots } = useHospitalSlots();
  const blockedSet = blockedSlotSet(availability?.blocks ?? [], selection.doctorId, selection.date, SLOTS);

  const patientOptions = patients.map((p) => ({
    value: p.id,
    label: p.user ? `${p.user.name} (${p.user.email})` : p.id,
  }));
  const doctorOptions = doctors.map((d) => ({
    value: d.id,
    label: `Dr. ${d.user?.name ?? 'Doctor'}`,
  }));

  return (
    <DashboardShell
      role={session.user.role}
      userName={session.user.name}
      title="Book Appointment"
      subtitle="Schedule an appointment for a patient"
    >
      <div className="max-w-3xl mx-auto">
        <div className="bg-white rounded-lg shadow-xl p-8 space-y-6">
          {submitError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-red-700">{submitError}</p>
            </div>
          )}
          {success && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              <p className="text-green-700">Appointment booked successfully! Redirecting…</p>
            </div>
          )}

          <Formik
            initialValues={prefill}
            enableReinitialize
            validationSchema={bookingSchema}
            onSubmit={async (values, { setFieldError }) => {
              setSubmitError('');
              if (slotStatus(values.time, values.date, bookedSet, blockedSet, breakSlots) !== 'available') {
                setFieldError('time', 'That slot is not available for the selected doctor');
                return;
              }

              const departmentId = departmentForDoctor(doctors, values.doctorId);
              const fee = feeForDoctor(doctors, values.doctorId);

              try {
                if (paymentMode === 'cash') {
                  // ── Cash: create appointment first, then a pending payment ──
                  const appointment = await createAppointment({
                    patientId: values.patientId,
                    doctorId: values.doctorId,
                    departmentId,
                    date: values.date,
                    time: values.time,
                    status: 'scheduled',
                    reason: values.reason,
                    notes: '',
                  }).unwrap();

                  // Record a pending cash payment. Staff collect the fee at the
                  // counter and mark it completed via the Payments screen.
                  if (fee > 0) {
                    await createPayment({
                      appointmentId: appointment.id,
                      patientId: values.patientId,
                      amount: fee,
                      paymentMethod: 'cash',
                      status: 'pending',
                    }).unwrap();
                  }

                  setSuccess(true);
                  setTimeout(() => router.push('/dashboard/appointments'), 1500);
                } else {
                  // ── Online: initiate Razorpay order → checkout → verify ────
                  setPaymentStatus('initiating');
                  const orderData = await initiatePayment({
                    doctorId: values.doctorId,
                    patientId: values.patientId,
                    departmentId,
                    date: values.date,
                    time: values.time,
                    reason: values.reason,
                    notes: '',
                  }).unwrap();

                  await loadRazorpayScript();
                  setPaymentStatus('checkout');

                  await new Promise<void>((resolve, reject) => {
                    if (!window.Razorpay) {
                      reject(new Error('Payment gateway failed to load. Please refresh and try again.'));
                      return;
                    }

                    const patientLabel = patients.find((p) => p.id === values.patientId);
                    const rzp = new window.Razorpay({
                      key: orderData.keyId,
                      amount: orderData.amountPaise,
                      currency: orderData.currency,
                      order_id: orderData.orderId,
                      name: 'Hospital Appointment',
                      description: `Consultation — ${values.date} ${values.time}`,
                      prefill: {
                        name: patientLabel?.user?.name ?? '',
                        contact: patientLabel?.phone ?? '',
                      },
                      handler: async (response: {
                        razorpay_order_id: string;
                        razorpay_payment_id: string;
                        razorpay_signature: string;
                      }) => {
                        setPaymentStatus('verifying');
                        rzp.close();
                        try {
                          await verifyPayment({
                            razorpayOrderId: response.razorpay_order_id,
                            razorpayPaymentId: response.razorpay_payment_id,
                            razorpaySignature: response.razorpay_signature,
                            doctorId: values.doctorId,
                            patientId: values.patientId,
                            departmentId,
                            date: values.date,
                            time: values.time,
                            reason: values.reason,
                            notes: '',
                          }).unwrap();
                          resolve();
                        } catch (err) {
                          reject(err);
                        }
                      },
                      modal: {
                        ondismiss: () => reject(new Error('Payment was cancelled.')),
                      },
                      theme: { color: '#0891b2' },
                    });
                    rzp.open();
                  });

                  setPaymentStatus('idle');
                  setSuccess(true);
                  setTimeout(() => router.push('/dashboard/appointments'), 1500);
                }
              } catch (err) {
                setPaymentStatus('idle');
                setSubmitError(apiError(err, 'Could not book the appointment'));
              }
            }}
          >
            {({ values, errors, touched, setFieldValue }) => {
              const fee = feeForDoctor(doctors, values.doctorId);

              // Label for the submit button based on flow state.
              const submitLabel = (() => {
                if (paymentStatus === 'initiating') return <><Loader2 className="w-4 h-4 animate-spin" /> Preparing payment…</>;
                if (paymentStatus === 'checkout') return <><Loader2 className="w-4 h-4 animate-spin" /> Opening checkout…</>;
                if (paymentStatus === 'verifying') return <><Loader2 className="w-4 h-4 animate-spin" /> Confirming…</>;
                if (paymentMode === 'cash') return 'Book Appointment';
                return `Pay ₹${fee} & Book`;
              })();

              return (
                <Form className="space-y-6">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <FormField
                      name="patientId"
                      label="Patient"
                      as="select"
                      placeholder="Select a patient"
                      options={patientOptions}
                      required
                    />
                    <FormField
                      name="doctorId"
                      label="Doctor"
                      as="select"
                      placeholder="Select a doctor"
                      options={doctorOptions}
                      required
                      onValueChange={(doctorId) => {
                        setSelection((s) => ({ ...s, doctorId }));
                        setFieldValue('time', '');
                      }}
                    />
                  </div>

                  <div className="grid md:grid-cols-2 gap-6">
                    {/* Calendar */}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Date <span className="text-red-500">*</span>
                      </label>
                      <Calendar
                        mode="single"
                        selected={values.date ? new Date(`${values.date}T00:00:00`) : undefined}
                        onSelect={(d) => {
                          const date = d ? toDateStr(d) : '';
                          setFieldValue('date', date);
                          setFieldValue('time', '');
                          setSelection((s) => ({ ...s, date }));
                        }}
                        disabled={{ before: new Date(new Date().setHours(0, 0, 0, 0)) }}
                        className="[--cell-size:2.4rem] rounded-lg border border-slate-200 w-full"
                      />
                      {touched.date && errors.date && (
                        <p className="flex items-center gap-1 text-red-500 text-sm mt-2">
                          <AlertCircle className="w-4 h-4 shrink-0" />
                          {errors.date}
                        </p>
                      )}
                    </div>

                    {/* Slots */}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Time slot <span className="text-red-500">*</span>
                      </label>
                      {!values.doctorId || !values.date ? (
                        <div className="min-h-[220px] flex items-center justify-center text-slate-400 text-sm border border-dashed border-slate-300 rounded-lg text-center px-4">
                          {values.doctorId ? 'Pick a date to see slots' : 'Select a doctor and date to see slots'}
                        </div>
                      ) : (
                        <>
                          <div className="flex flex-wrap gap-4 mb-3 text-xs text-slate-600">
                            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm border border-cyan-400 bg-white" /> Available</span>
                            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-red-200" /> Booked</span>
                            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-slate-200" /> Blocked</span>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {SLOTS.map((slot) => {
                              const st = slotStatus(slot, values.date, bookedSet, blockedSet, breakSlots);
                              const selected = values.time === slot && st === 'available';
                              const cls = selected
                                ? 'bg-cyan-600 text-white border-cyan-600'
                                : st === 'available'
                                ? 'bg-white text-slate-700 border-cyan-200 hover:border-cyan-500 hover:bg-cyan-50'
                                : st === 'booked'
                                ? 'bg-red-50 text-red-400 border-red-200 line-through cursor-not-allowed'
                                : 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed';
                              return (
                                <button
                                  key={slot}
                                  type="button"
                                  disabled={st !== 'available'}
                                  onClick={() => setFieldValue('time', slot)}
                                  className={`px-2 py-2 rounded-lg border text-sm font-medium transition ${cls}`}
                                >
                                  {slot}
                                </button>
                              );
                            })}
                          </div>
                          {touched.time && errors.time && (
                            <p className="flex items-center gap-1 text-red-500 text-sm mt-3">
                              <AlertCircle className="w-4 h-4 shrink-0" />
                              {errors.time}
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  <FormField
                    name="reason"
                    label="Reason for Visit (Optional)"
                    as="textarea"
                    placeholder="Describe the reason for the appointment"
                    rows={3}
                  />

                  {/* Payment mode selector */}
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-slate-700">Payment Mode</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setPaymentMode('cash')}
                        className={`flex items-center gap-2 justify-center px-4 py-3 rounded-lg border-2 transition text-sm font-medium ${
                          paymentMode === 'cash'
                            ? 'border-cyan-600 bg-cyan-50 text-cyan-700'
                            : 'border-slate-200 text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        <Banknote className="w-4 h-4" />
                        Cash at Counter
                      </button>
                      <button
                        type="button"
                        onClick={() => setPaymentMode('online')}
                        className={`flex items-center gap-2 justify-center px-4 py-3 rounded-lg border-2 transition text-sm font-medium ${
                          paymentMode === 'online'
                            ? 'border-cyan-600 bg-cyan-50 text-cyan-700'
                            : 'border-slate-200 text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        <CreditCard className="w-4 h-4" />
                        Online Payment
                      </button>
                    </div>
                    {paymentMode === 'cash' && (
                      <p className="text-xs text-slate-500">
                        A pending payment record will be created. Mark it paid after collecting the fee at the counter.
                      </p>
                    )}
                    {paymentMode === 'online' && (
                      <p className="text-xs text-slate-500">
                        A Razorpay checkout will open. The appointment is confirmed only after the payment succeeds.
                      </p>
                    )}
                  </div>

                  {/* Fee display when a doctor is selected */}
                  {values.doctorId && fee > 0 && (
                    <div className="flex justify-between items-center bg-slate-50 rounded-lg px-4 py-3 text-sm">
                      <span className="text-slate-600">Consultation Fee</span>
                      <span className="font-semibold text-cyan-600">₹{fee}</span>
                    </div>
                  )}

                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => router.push('/dashboard/appointments')}
                      disabled={paymentStatus !== 'idle'}
                      className="flex-1 px-6 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition disabled:opacity-40"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={success || paymentStatus !== 'idle'}
                      className="flex-1 px-6 py-2 bg-gradient-to-r from-cyan-500 to-brand-teal text-white rounded-lg hover:shadow-lg transition font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {submitLabel}
                    </button>
                  </div>
                </Form>
              );
            }}
          </Formik>
        </div>
      </div>
    </DashboardShell>
  );
}

// useSearchParams() must be wrapped in a Suspense boundary for static rendering.
export function AdminBook({ session }: RoleViewProps) {
  return (
    <Suspense fallback={null}>
      <AdminBookForm session={session} />
    </Suspense>
  );
}
