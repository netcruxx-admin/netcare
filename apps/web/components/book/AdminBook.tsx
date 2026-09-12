'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import { CheckCircle, AlertCircle } from 'lucide-react';
import type { ConsultationFee, Doctor } from '@/lib/types';
import { apiError } from '@/lib/apiError';
import { blockedSlotSet } from '@/lib/schedule';
import { useHospitalSlots } from '@/hooks/useBreakSlots';
import { useDepartmentBookingConflict } from '@/hooks/useDepartmentBookingConflict';
import {
  useCreateAppointmentMutation,
  useGetDoctorAvailabilityQuery,
  useInitiatePaymentMutation,
  useListConsultationFeesQuery,
  useListDoctorsQuery,
  useListPatientsQuery,
  useVerifyPaymentMutation,
} from '@/store/api';
import { DashboardShell } from '@/components/DashboardShell';
import type { RoleViewProps } from '@/components/RoleView';
import { FormField } from '@/components/form/FormField';
import { Calendar } from '@/components/ui/calendar';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { PaymentModeField, isCounterMode, type PaymentMode } from '@/components/payments/PaymentModeField';

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

/** What this visit costs, from the hospital's published price list.
 *
 *  Only ever used for display and for the pending cash record: the server
 *  re-prices every online booking from the same schedule, so a number tampered
 *  with here buys nothing. */
function feeForVisitType(fees: ConsultationFee[], visitType: string): number {
  return fees.find((f) => f.visitType === visitType)?.amount ?? 0;
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const bookingSchema = Yup.object({
  patientId: Yup.string().required('Select a patient'),
  doctorId: Yup.string().required('Select a doctor'),
  date: Yup.string().required('Pick a date'),
  time: Yup.string().required('Select a time slot'),
  visitType: Yup.string().required('Select a visit type'),
  reason: Yup.string().trim().required('Tell us why the appointment is needed'),
});

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function AdminBookForm({ session }: RoleViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [submitError, setSubmitError] = useState('');
  const [success, setSuccess] = useState(false);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('cash');
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'initiating' | 'checkout' | 'verifying'>('idle');

  const { data: patients = [], isLoading: loadingPatients } = useListPatientsQuery();
  const { data: doctors = [], isLoading: loadingDoctors } = useListDoctorsQuery();
  const { data: fees = [] } = useListConsultationFeesQuery();
  const [createAppointment] = useCreateAppointmentMutation();
  const [initiatePayment] = useInitiatePaymentMutation();
  const [verifyPayment] = useVerifyPaymentMutation();

  // Prefill from query params (e.g. when arriving from a Schedule board slot, or
  // straight from registering a patient). `patient` is a Patient id; the
  // `patientUser` form — used by the post-registration prompt — is a user id
  // resolved against the loaded list once it lands.
  const patientUserId = searchParams.get('patientUser') ?? '';
  const prefill = {
    patientId:
      searchParams.get('patient') ??
      (patientUserId ? patients.find((p) => p.userId === patientUserId)?.id ?? '' : ''),
    doctorId: searchParams.get('doctor') ?? '',
    date: searchParams.get('date') ?? '',
    time: searchParams.get('time') ?? '',
    visitType: 'new',
    reason: '',
  };

  // Mirrors the form's patient/doctor/date so hooks — which cannot live inside
  // Formik's render prop — can react to them.
  const [selection, setSelection] = useState({
    patientId: prefill.patientId,
    doctorId: prefill.doctorId,
    date: prefill.date,
  });
  // Until availability lands, every slot would draw as free — which is not a
  // slower answer but a wrong one, so the grid waits instead of guessing.
  const { data: availability, isFetching: loadingAvailability } = useGetDoctorAvailabilityQuery(
    { doctorId: selection.doctorId, date: selection.date },
    { skip: !selection.doctorId || !selection.date },
  );
  const bookedSet = new Set(availability?.taken ?? []);
  const { slots: SLOTS, breakSlots } = useHospitalSlots();
  const blockedSet = blockedSlotSet(availability?.blocks ?? [], selection.doctorId, selection.date, SLOTS);

  // Same one-booking-per-department-per-day rule the server enforces on
  // create — checked here too so picking a date that already collides is
  // caught before the rest of the form is filled in.
  const deptConflict = useDepartmentBookingConflict(
    selection.patientId,
    departmentForDoctor(doctors, selection.doctorId),
    selection.date,
  );

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
              if (deptConflict) {
                setSubmitError('This patient already has an appointment in this department on this date.');
                return;
              }

              const departmentId = departmentForDoctor(doctors, values.doctorId);

              try {
                if (isCounterMode(paymentMode)) {
                  // ── Paid at the desk: one call. The server raises the pending
                  //    payment alongside the booking, priced from the schedule —
                  //    a second POST /payments from here would 403 for a doctor,
                  //    who may book but holds no `payments.create`.
                  await createAppointment({
                    patientId: values.patientId,
                    doctorId: values.doctorId,
                    departmentId,
                    date: values.date,
                    time: values.time,
                    status: 'scheduled',
                    visitType: values.visitType,
                    reason: values.reason,
                    notes: '',
                    paymentMode,
                  }).unwrap();

                  setSuccess(true);
                  setTimeout(() => router.push('/dashboard/appointments'), 1500);
                } else {
                  // ── Online: initiate Razorpay order → checkout → verify ────
                  setPaymentStatus('initiating');
                  const orderData = await initiatePayment({
                    doctorId: values.doctorId,
                    patientId: values.patientId,
                    departmentId,
                    visitType: values.visitType,
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
                            visitType: values.visitType,
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
              const fee = feeForVisitType(fees, values.visitType);
              const visitTypeOptions = fees.map((f) => ({
                value: f.visitType,
                label: f.amount > 0 ? `${f.label} — ₹${f.amount}` : f.label,
              }));

              // Label for the submit button based on flow state.
              const submitLabel = (() => {
                if (paymentStatus === 'initiating') return <Spinner size="sm" label="Preparing payment…" />;
                if (paymentStatus === 'checkout') return <Spinner size="sm" label="Opening checkout…" />;
                if (paymentStatus === 'verifying') return <Spinner size="sm" label="Confirming…" />;
                if (isCounterMode(paymentMode)) return 'Book Appointment';
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
                      onValueChange={(patientId) => setSelection((s) => ({ ...s, patientId }))}
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
                      ) : loadingAvailability ? (
                        <Spinner variant="block" className="py-0 min-h-[220px] border border-dashed border-slate-300 rounded-lg" label="Checking availability…" />
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

                  {/* What kind of visit this is — the hospital prices each one,
                      so this is also what decides the fee. */}
                  <FormField
                    name="visitType"
                    label="Visit Type"
                    as="select"
                    required
                    options={visitTypeOptions}
                  />

                  <FormField
                    name="reason"
                    label="Reason for Visit"
                    required
                    as="textarea"
                    placeholder="Describe the reason for the appointment"
                    rows={3}
                  />

                  {deptConflict && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <p className="text-amber-800 text-sm">
                        This patient already has an appointment in this department on this date. Pick a different date, or cancel the existing one first.
                      </p>
                    </div>
                  )}

                  {/* Payment mode selector */}
                  <PaymentModeField value={paymentMode} onChange={setPaymentMode} />

                  {/* What this visit costs, per the hospital's price list */}
                  {fee > 0 && (
                    <div className="flex justify-between items-center bg-slate-50 rounded-lg px-4 py-3 text-sm">
                      <span className="text-slate-600">
                        Consultation Fee
                        <span className="text-slate-400 ml-1">
                          ({fees.find((f) => f.visitType === values.visitType)?.label ?? values.visitType})
                        </span>
                      </span>
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
                    <Button
                      type="submit"
                      disabled={success || paymentStatus !== 'idle' || deptConflict}
                      variant="brand"
                      className="flex-1"
                    >
                      {submitLabel}
                    </Button>
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
