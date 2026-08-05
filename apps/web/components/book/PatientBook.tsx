'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import { CheckCircle, AlertCircle } from 'lucide-react';
import type { Appointment, Department, Doctor, ScheduleBlock } from '@/lib/types';
import { apiError } from '@/lib/apiError';
import {
  useCreateAppointmentMutation,
  useGetDoctorAvailabilityQuery,
  useGetPatientByUserQuery,
  useListDepartmentsQuery,
  useListDoctorsQuery,
  useListScheduleBlocksQuery,
} from '@/store/api';
import { blockedSlotSet } from '@/lib/schedule';
import { DashboardShell } from '@/components/DashboardShell';
import type { RoleViewProps } from '@/components/RoleView';
import { FormField } from '@/components/form/FormField';
import { Calendar } from '@/components/ui/calendar';

// ---------------------------------------------------------------------------
// Constants
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

const SLOTS = [
  '09:00 AM', '09:30 AM', '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM',
  '12:00 PM', '01:00 PM', '02:00 PM', '02:30 PM', '03:00 PM', '03:30 PM',
  '04:00 PM', '04:30 PM',
];
// Clinic lunch break — always unavailable
const BREAK_SLOTS = new Set(['12:00 PM', '01:00 PM']);

// Maximum number of dept doctors to fetch availability for in parallel.
// 5 covers virtually all real departments; hooks must be a fixed count.
const MAX_DEPT = 5;

// ---------------------------------------------------------------------------
// Multi-doctor availability helpers
// ---------------------------------------------------------------------------

type AvailabilityData = { taken: string[]; blocks: ScheduleBlock[] } | undefined;
type SlotStatus = 'available' | 'booked' | 'blocked';

/**
 * A slot is available for booking if ANY doctor in the department is free at
 * that time. Shows as booked only when every doctor's data is loaded and all
 * have it taken.
 */
function getDeptSlotStatus(
  slot: string,
  date: string,
  deptDoctors: Doctor[],
  allAv: AvailabilityData[],
): SlotStatus {
  if (BREAK_SLOTS.has(slot)) return 'blocked';
  if (date === today) {
    const now = new Date();
    if (slotToMinutes(slot) <= now.getHours() * 60 + now.getMinutes()) return 'blocked';
  }
  for (let i = 0; i < deptDoctors.length; i++) {
    const av = allAv[i];
    if (!av) continue; // not loaded yet — optimistic
    const booked = new Set(av.taken ?? []);
    const blocked = blockedSlotSet(av.blocks ?? [], deptDoctors[i].id, date, SLOTS);
    if (!booked.has(slot) && !blocked.has(slot)) return 'available';
  }
  // All data loaded and no doctor is free
  return deptDoctors.every((_, i) => !!allAv[i]) ? 'booked' : 'available';
}

/**
 * Among all department doctors who are free at `slot`, return the one with the
 * fewest appointments that day (least busy). Falls back to first available.
 */
function pickLeastBusy(
  slot: string,
  date: string,
  deptDoctors: Doctor[],
  allAv: AvailabilityData[],
): string {
  const candidates: Array<{ id: string; takenCount: number }> = [];
  for (let i = 0; i < deptDoctors.length; i++) {
    const av = allAv[i];
    if (!av) continue;
    const booked = new Set(av.taken ?? []);
    const blocked = blockedSlotSet(av.blocks ?? [], deptDoctors[i].id, date, SLOTS);
    if (!booked.has(slot) && !blocked.has(slot)) {
      candidates.push({ id: deptDoctors[i].id, takenCount: (av.taken ?? []).length });
    }
  }
  if (candidates.length === 0) return deptDoctors[0]?.id ?? '';
  candidates.sort((a, b) => a.takenCount - b.takenCount);
  return candidates[0].id;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const bookingSchema = Yup.object({
  department: Yup.string().required('Please select a department'),
  date: Yup.string().required('Date is required'),
  time: Yup.string().required('Please select a time slot'),
  reason: Yup.string(),
});

const initialValues = { department: '', date: '', time: '', reason: '' };

export function PatientBook({ session }: RoleViewProps) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [submitError, setSubmitError] = useState('');
  const [success, setSuccess] = useState(false);
  const [selection, setSelection] = useState({ department: '', date: '' });

  const { data: departments = [] } = useListDepartmentsQuery();
  const { data: doctors = [] } = useListDoctorsQuery();
  const { data: patient } = useGetPatientByUserQuery(session.user.id);
  const [createAppointment] = useCreateAppointmentMutation();

  // Doctors in the selected department, capped at MAX_DEPT so hook count is fixed.
  const deptDoctors = useMemo<Doctor[]>(() => {
    if (!selection.department) return [];
    const dept = departments.find((d) => d.id === selection.department);
    const matched = dept
      ? doctors.filter(
          (doc) =>
            doc.specialization === dept.name ||
            doc.specialization.includes(dept.name.split('&')[0]),
        )
      : [];
    return (matched.length > 0 ? matched : doctors).slice(0, MAX_DEPT);
  }, [departments, doctors, selection.department]);

  // Fixed 5 availability hooks — skip when no doctor at that index or no date.
  // React requires hooks to be called the same number of times every render;
  // the `skip` option handles the "not applicable" case without violating that.
  const av0 = useGetDoctorAvailabilityQuery(
    { doctorId: deptDoctors[0]?.id ?? '', date: selection.date },
    { skip: !deptDoctors[0] || !selection.date },
  );
  const av1 = useGetDoctorAvailabilityQuery(
    { doctorId: deptDoctors[1]?.id ?? '', date: selection.date },
    { skip: !deptDoctors[1] || !selection.date },
  );
  const av2 = useGetDoctorAvailabilityQuery(
    { doctorId: deptDoctors[2]?.id ?? '', date: selection.date },
    { skip: !deptDoctors[2] || !selection.date },
  );
  const av3 = useGetDoctorAvailabilityQuery(
    { doctorId: deptDoctors[3]?.id ?? '', date: selection.date },
    { skip: !deptDoctors[3] || !selection.date },
  );
  const av4 = useGetDoctorAvailabilityQuery(
    { doctorId: deptDoctors[4]?.id ?? '', date: selection.date },
    { skip: !deptDoctors[4] || !selection.date },
  );
  const allAv: AvailabilityData[] = [av0.data, av1.data, av2.data, av3.data, av4.data];

  return (
    <DashboardShell
      role={session.user.role}
      userName={session.user.name}
      title="Book Appointment"
      subtitle="Schedule a new consultation"
    >
      <div className="max-w-3xl mx-auto">
        <div className="bg-white rounded-lg shadow-xl p-8 space-y-8">
          {/* Progress Steps */}
          <div className="flex justify-between items-center mb-8">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex items-center flex-1">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                    s <= step ? 'bg-cyan-600 text-white' : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {s}
                </div>
                {s < 3 && (
                  <div className={`flex-1 h-1 mx-2 ${s < step ? 'bg-cyan-600' : 'bg-slate-200'}`} />
                )}
              </div>
            ))}
          </div>

          {submitError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-red-700">{submitError}</p>
            </div>
          )}

          {success && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              <p className="text-green-700">Appointment booked successfully! Redirecting...</p>
            </div>
          )}

          <Formik
            initialValues={initialValues}
            validationSchema={bookingSchema}
            onSubmit={async (values) => {
              setSubmitError('');
              try {
                if (!patient) {
                  setSubmitError('Patient information not found');
                  return;
                }

                // Assign the least-busy doctor who is free at the chosen slot.
                const doctorId = pickLeastBusy(values.time, values.date, deptDoctors, allAv);
                if (!doctorId) {
                  setSubmitError('No doctor is available for that slot. Please pick another time.');
                  return;
                }

                // Guard against the slot being taken between page load and submit.
                const st = getDeptSlotStatus(values.time, values.date, deptDoctors, allAv);
                if (st !== 'available') {
                  setSubmitError('That time slot is no longer available. Please pick another.');
                  return;
                }

                await createAppointment({
                  patientId: patient.id,
                  doctorId,
                  departmentId: values.department,
                  date: values.date,
                  time: values.time,
                  status: 'scheduled',
                  reason: values.reason,
                  notes: '',
                }).unwrap();
                setSuccess(true);
                setTimeout(() => router.push('/dashboard'), 2000);
              } catch (err) {
                setSubmitError(apiError(err, 'Failed to book appointment. Please try again.'));
              }
            }}
          >
            {({ values, errors, touched, setFieldValue, setFieldTouched, validateForm, isSubmitting }) => {
              // Resolve the doctor's name for the selected slot so the patient
              // can see who they'll see — but only after they've picked a time.
              const assignedDoc = (() => {
                if (!values.time || !values.date) return null;
                const docId = pickLeastBusy(values.time, values.date, deptDoctors, allAv);
                const doc = doctors.find((d) => d.id === docId);
                return doc?.user?.name ? `Dr. ${doc.user.name}` : null;
              })();

              return (
                <Form className="space-y-6">
                  {/* Step 1: Department */}
                  {step === 1 && (
                    <div className="space-y-4">
                      <h2 className="text-2xl font-bold text-slate-900">Select Department</h2>
                      <div className="grid md:grid-cols-2 gap-4">
                        {departments.map((dept) => (
                          <button
                            key={dept.id}
                            type="button"
                            onClick={() => {
                              setFieldValue('department', dept.id);
                              setFieldValue('date', '');
                              setFieldValue('time', '');
                              setSelection({ department: dept.id, date: '' });
                              setStep(2);
                            }}
                            className={`p-4 rounded-lg border-2 transition text-left ${
                              values.department === dept.id
                                ? 'border-cyan-600 bg-cyan-50'
                                : 'border-slate-200 hover:border-cyan-600'
                            }`}
                          >
                            <h3 className="font-semibold text-slate-900">{dept.name}</h3>
                            <p className="text-slate-600 text-sm">{dept.description}</p>
                          </button>
                        ))}
                      </div>
                      {touched.department && errors.department && (
                        <p className="flex items-center gap-1 text-red-500 text-sm mt-1">
                          <AlertCircle className="w-4 h-4 shrink-0" />
                          {errors.department}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Step 2: Date & Time */}
                  {step === 2 && (
                    <div className="space-y-5">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <h2 className="text-2xl font-bold text-slate-900">Select Date &amp; Time</h2>
                        {assignedDoc && (
                          <span className="text-sm text-slate-500">
                            Assigned doctor:{' '}
                            <span className="font-semibold text-slate-700">{assignedDoc}</span>
                          </span>
                        )}
                      </div>

                      <div className="grid md:grid-cols-2 gap-6">
                        {/* Calendar */}
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-2">Choose a date</label>
                          <Calendar
                            mode="single"
                            selected={values.date ? new Date(`${values.date}T00:00:00`) : undefined}
                            onSelect={(d) => {
                              const ds = d ? toDateStr(d) : '';
                              setFieldValue('date', ds);
                              setFieldValue('time', '');
                              setSelection((s) => ({ ...s, date: ds }));
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

                        {/* Time slots */}
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-2">
                            Available time slots
                          </label>
                          {!values.date ? (
                            <div className="min-h-[220px] flex items-center justify-center text-slate-400 text-sm border border-dashed border-slate-300 rounded-lg">
                              Pick a date to see slots
                            </div>
                          ) : (
                            <>
                              <div className="flex flex-wrap gap-4 mb-3 text-xs text-slate-600">
                                <span className="flex items-center gap-1.5">
                                  <span className="w-3 h-3 rounded-sm border border-cyan-400 bg-white" /> Available
                                </span>
                                <span className="flex items-center gap-1.5">
                                  <span className="w-3 h-3 rounded-sm bg-red-200" /> Booked
                                </span>
                                <span className="flex items-center gap-1.5">
                                  <span className="w-3 h-3 rounded-sm bg-slate-200" /> Blocked
                                </span>
                              </div>
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                {SLOTS.map((slot) => {
                                  const st = getDeptSlotStatus(slot, values.date, deptDoctors, allAv);
                                  const selected = values.time === slot;
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

                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => setStep(1)}
                          className="flex-1 px-6 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition"
                        >
                          Back
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await setFieldTouched('date', true);
                            await setFieldTouched('time', true);
                            const errs = await validateForm();
                            if (!errs.date && !errs.time) setStep(3);
                          }}
                          className="flex-1 px-6 py-2 bg-gradient-to-r from-cyan-500 to-brand-teal text-white rounded-lg hover:shadow-lg transition"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Step 3: Reason & Confirmation */}
                  {step === 3 && (
                    <div className="space-y-4">
                      <h2 className="text-2xl font-bold text-slate-900">Reason &amp; Confirmation</h2>
                      <FormField
                        name="reason"
                        label="Reason for Visit (Optional)"
                        as="textarea"
                        placeholder="Describe your symptoms or reason for visit"
                        rows={4}
                      />

                      <div className="bg-slate-50 rounded-lg p-4 space-y-3">
                        <h3 className="font-semibold text-slate-900">Appointment Summary</h3>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-slate-600">Department:</span>
                            <span className="font-semibold">
                              {departments.find((d) => d.id === values.department)?.name}
                            </span>
                          </div>
                          {assignedDoc && (
                            <div className="flex justify-between">
                              <span className="text-slate-600">Doctor:</span>
                              <span className="font-semibold">{assignedDoc}</span>
                            </div>
                          )}
                          <div className="flex justify-between">
                            <span className="text-slate-600">Date:</span>
                            <span className="font-semibold">{values.date}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-600">Time:</span>
                            <span className="font-semibold">{values.time}</span>
                          </div>
                          <div className="border-t pt-2 flex justify-between">
                            <span className="font-semibold text-slate-900">Consultation Fee:</span>
                            <span className="font-semibold text-cyan-600">₹500</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => setStep(2)}
                          className="flex-1 px-6 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition"
                        >
                          Back
                        </button>
                        <button
                          type="submit"
                          disabled={isSubmitting}
                          className="flex-1 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-semibold disabled:opacity-50"
                        >
                          Confirm Booking
                        </button>
                      </div>
                    </div>
                  )}
                </Form>
              );
            }}
          </Formik>
        </div>
      </div>
    </DashboardShell>
  );
}
