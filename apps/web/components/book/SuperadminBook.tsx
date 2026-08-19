'use client';

import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import { CheckCircle, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import type { Patient, Doctor } from '@/lib/types';
import { blockedSlotSet } from '@/lib/schedule';
import { superadminGet, superadminPost } from '@/lib/superadminFetch';
import { useListHospitalsQuery, useGetDoctorAvailabilityQuery } from '@/store/api';
import { DashboardShell } from '@/components/DashboardShell';
import type { RoleViewProps } from '@/components/RoleView';
import { FormField } from '@/components/form/FormField';
import { Calendar } from '@/components/ui/calendar';

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
const BREAK_SLOTS = new Set(['12:00 PM', '01:00 PM']);

type SlotStatus = 'available' | 'booked' | 'blocked';
function slotStatus(slot: string, date: string, booked: Set<string>, blocked: Set<string>): SlotStatus {
  if (BREAK_SLOTS.has(slot) || blocked.has(slot)) return 'blocked';
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

const bookingSchema = Yup.object({
  patientId: Yup.string().required('Select a patient'),
  doctorId: Yup.string().required('Select a doctor'),
  date: Yup.string().required('Pick a date'),
  time: Yup.string().required('Select a time slot'),
  reason: Yup.string(),
});

function SuperadminBookForm({ session }: RoleViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const { data: allHospitals = [] } = useListHospitalsQuery();
  const [hospitalId, setHospitalId] = useState(searchParams.get('h') ?? '');

  const [patients, setPatients] = useState<Patient[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);

  const [submitError, setSubmitError] = useState('');
  const [success, setSuccess] = useState(false);

  // Reload patients/doctors/departments whenever the hospital changes.
  useEffect(() => {
    if (!hospitalId) {
      setPatients([]); setDoctors([]); setDepartments([]);
      return;
    }
    setLoadingOptions(true);
    setPatients([]); setDoctors([]);

    Promise.all([
      superadminGet<Patient[]>('/patients', hospitalId),
      superadminGet<Doctor[]>('/doctors', hospitalId),
    ])
      .then(([p, d]) => { setPatients(p); setDoctors(d); })
      .catch(() => {/* silent */})
      .finally(() => setLoadingOptions(false));
  }, [hospitalId]);

  const [selection, setSelection] = useState({ doctorId: '', date: '' });

  const { data: availability } = useGetDoctorAvailabilityQuery(
    { doctorId: selection.doctorId, date: selection.date },
    { skip: !selection.doctorId || !selection.date || !hospitalId },
  );
  const booked = new Set(availability?.taken ?? []);
  const blocked = blockedSlotSet(availability?.blocks ?? [], selection.doctorId, selection.date, SLOTS);

  const patientOptions = patients.map((p) => ({
    value: p.id,
    label: p.user ? `${p.user.name} (${p.user.email})` : p.id,
  }));
  const doctorOptions = doctors.map((d) => ({
    value: d.id,
    label: `Dr. ${d.user?.name ?? 'Doctor'}${d.specialization ? ` — ${d.specialization}` : ''}`,
  }));

  const backHref = hospitalId
    ? `/dashboard/appointments?h=${hospitalId}`
    : '/dashboard/appointments';

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

          {/* Hospital selector */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Hospital <span className="text-red-500">*</span>
            </label>
            <select
              value={hospitalId}
              onChange={(e) => {
                setHospitalId(e.target.value);
                setSelection({ doctorId: '', date: '' });
              }}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500"
            >
              <option value="">Select a hospital…</option>
              {allHospitals.map((h) => (
                <option key={h.id} value={h.id}>{h.name}</option>
              ))}
            </select>
          </div>

          <Formik
            initialValues={{ patientId: '', doctorId: '', date: '', time: '', reason: '' }}
            enableReinitialize
            validationSchema={bookingSchema}
            onSubmit={async (values, { setFieldError }) => {
              if (!hospitalId) { setSubmitError('Please select a hospital'); return; }
              setSubmitError('');
              if (slotStatus(values.time, values.date, booked, blocked) !== 'available') {
                setFieldError('time', 'That slot is not available for the selected doctor');
                return;
              }
              try {
                await superadminPost('/appointments', hospitalId, {
                  patientId: values.patientId,
                  doctorId: values.doctorId,
                  departmentId: departmentForDoctor(doctors, values.doctorId),
                  date: values.date,
                  time: values.time,
                  status: 'scheduled',
                  reason: values.reason,
                  notes: '',
                });
                toast.success('Appointment booked successfully');
                setSuccess(true);
                setTimeout(() => router.push(backHref), 1500);
              } catch (err) {
                setSubmitError(err instanceof Error ? err.message : 'Could not book the appointment');
              }
            }}
          >
            {({ values, errors, touched, setFieldValue }) => (
              <Form className="space-y-6">
                {loadingOptions && (
                  <p className="text-xs text-slate-400 text-center">Loading options…</p>
                )}

                <fieldset disabled={!hospitalId} className="space-y-6">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <FormField
                      name="patientId"
                      label="Patient"
                      as="select"
                      placeholder={patients.length ? 'Select a patient' : 'No patients yet'}
                      options={patientOptions}
                      required
                    />
                    <FormField
                      name="doctorId"
                      label="Doctor"
                      as="select"
                      placeholder={doctors.length ? 'Select a doctor' : 'No doctors yet'}
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

                    {/* Time slots */}
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
                              const st = slotStatus(slot, values.date, booked, blocked);
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
                </fieldset>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => router.push(backHref)}
                    className="flex-1 px-6 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={success || !hospitalId}
                    className="flex-1 px-6 py-2 bg-gradient-to-r from-cyan-500 to-brand-teal text-white rounded-lg hover:shadow-lg transition font-semibold disabled:opacity-50"
                  >
                    Book Appointment
                  </button>
                </div>
              </Form>
            )}
          </Formik>
        </div>
      </div>
    </DashboardShell>
  );
}

export function SuperadminBook({ session }: RoleViewProps) {
  return (
    <Suspense fallback={null}>
      <SuperadminBookForm session={session} />
    </Suspense>
  );
}
