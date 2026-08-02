'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import {
  CalendarDays, Plus, Trash2, AlertTriangle, Search,
  Eye, Pencil, Activity, X, CalendarClock, CalendarPlus,
} from 'lucide-react';
import { toast } from 'sonner';
import { DashboardShell } from '@/components/DashboardShell';
import type { RoleViewProps } from '@/components/RoleView';
import { HospitalBadge } from '@/components/superadmin/HospitalBadge';
import { ActionIcon } from '@/components/ActionIcon';
import { FormField } from '@/components/form/FormField';
import { FollowUpModal } from '@/components/FollowUpModal';
import { Calendar } from '@/components/ui/calendar';
import { apiError } from '@/lib/apiError';
import { hasPermission } from '@/lib/auth';
import type { Appointment, Department, Doctor } from '@/lib/types';
import {
  useGetSuperadminAppointmentsQuery,
  useGetSuperadminPatientsQuery,
  useGetSuperadminDoctorsQuery,
  useGetSuperadminDepartmentsQuery,
  useListHospitalsQuery,
  useUpdateAppointmentMutation,
  useDeleteAppointmentMutation,
  useCreateVitalsMutation,
} from '@/store/api';

const STATUS_STYLES: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
};

const statusOptions = [
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const editSchema = Yup.object({
  doctorId: Yup.string().required('Select a doctor'),
  status: Yup.string().oneOf(['scheduled', 'completed', 'cancelled']).required(),
  reason: Yup.string().max(200, 'Too long'),
});

const numOpt = Yup.number()
  .transform((v, o) => (o === '' ? undefined : v))
  .typeError('Must be a number')
  .min(0, 'Cannot be negative');

const vitalsSchema = Yup.object({
  temperature: numOpt,
  heartRate: numOpt,
  respiratoryRate: numOpt,
  weight: numOpt,
  height: numOpt,
  bloodPressure: Yup.string().max(15, 'Too long'),
  notes: Yup.string().max(300, 'Too long'),
});

function toDateStr(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const SLOTS = [
  '09:00 AM', '09:30 AM', '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM',
  '12:00 PM', '01:00 PM', '02:00 PM', '02:30 PM', '03:00 PM', '03:30 PM',
  '04:00 PM', '04:30 PM',
];
const BREAK_SLOTS = new Set(['12:00 PM', '01:00 PM']);
const todayStr = toDateStr(new Date());

function slotToMinutes(slot: string) {
  const [t, mer] = slot.split(' ');
  let [h, m] = t.split(':').map(Number);
  if (mer === 'PM' && h !== 12) h += 12;
  if (mer === 'AM' && h === 12) h = 0;
  return h * 60 + m;
}

function slotStatus(slot: string, date: string, booked: Set<string>) {
  if (BREAK_SLOTS.has(slot)) return 'blocked';
  if (date === todayStr) {
    const now = new Date();
    if (slotToMinutes(slot) <= now.getHours() * 60 + now.getMinutes()) return 'blocked';
  }
  if (booked.has(slot)) return 'booked';
  return 'available';
}

function departmentForDoctor(departments: Department[], doctors: Doctor[], doctorId: string) {
  const doc = doctors.find((d) => d.id === doctorId);
  return departments.find((d) => d.name === doc?.specialization)?.id ?? departments[0]?.id ?? '';
}

export function PlatformAppointments({ session }: RoleViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedHospitalId = searchParams.get('h') ?? '';
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [rescheduling, setRescheduling] = useState<Appointment | null>(null);
  const [reDate, setReDate] = useState('');
  const [reTime, setReTime] = useState('');
  const [followUp, setFollowUp] = useState<Appointment | null>(null);
  const [addingVitals, setAddingVitals] = useState<Appointment | null>(null);
  const [deleting, setDeleting] = useState<Appointment | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const { data: allAppointments = [], isLoading, refetch } = useGetSuperadminAppointmentsQuery();
  const { data: allPatients = [] } = useGetSuperadminPatientsQuery();
  const { data: allDoctors = [] } = useGetSuperadminDoctorsQuery();
  const { data: allDepartments = [] } = useGetSuperadminDepartmentsQuery();
  const { data: hospitals = [] } = useListHospitalsQuery();
  const [updateAppointment] = useUpdateAppointmentMutation();
  const [deleteAppointment] = useDeleteAppointmentMutation();
  const [createVitals] = useCreateVitalsMutation();

  const patientById = useMemo(() => new Map(allPatients.map((p) => [p.id, p])), [allPatients]);
  const doctorById = useMemo(() => new Map(allDoctors.map((d) => [d.id, d])), [allDoctors]);

  const patientName = (id: string) => patientById.get(id)?.user?.name ?? '—';
  const doctorName = (id: string) => {
    const name = doctorById.get(id)?.user?.name;
    return name ? `Dr. ${name}` : '—';
  };

  // Doctors filtered to the same hospital as the appointment being edited
  const doctorOptions = useMemo(() => {
    const hid = editing?.hospitalId ?? rescheduling?.hospitalId;
    return allDoctors
      .filter((d) => !hid || d.hospitalId === hid)
      .map((d) => ({ value: d.id, label: `Dr. ${d.user?.name ?? 'Doctor'} — ${d.specialization}` }));
  }, [allDoctors, editing, rescheduling]);

  const appointments = useMemo(() => allAppointments
    .filter((a) => !selectedHospitalId || a.hospitalId === selectedHospitalId)
    .filter((a) => statusFilter === 'all' || a.status === statusFilter)
    .filter((a) => {
      const q = query.trim().toLowerCase();
      if (!q) return true;
      return patientName(a.patientId).toLowerCase().includes(q)
        || doctorName(a.doctorId).toLowerCase().includes(q)
        || a.status.toLowerCase().includes(q);
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allAppointments, selectedHospitalId, statusFilter, query, patientById, doctorById],
  );

  const showHospital = !selectedHospitalId;

  // Booked slots for the appointment being rescheduled
  const reBooked = useMemo(() => {
    if (!rescheduling || !reDate) return new Set<string>();
    return new Set(
      allAppointments
        .filter((a) => a.doctorId === rescheduling.doctorId && a.date === reDate && a.status === 'scheduled' && a.id !== rescheduling.id)
        .map((a) => a.time),
    );
  }, [allAppointments, rescheduling, reDate]);

  const openReschedule = (a: Appointment) => {
    setReDate(a.date);
    setReTime(a.time);
    setRescheduling(a);
  };

  const saveReschedule = async () => {
    if (!rescheduling || !reDate || !reTime) return;
    setError('');
    try {
      await updateAppointment({ id: rescheduling.id, hospitalId: rescheduling.hospitalId, body: { date: reDate, time: reTime } }).unwrap();
      setRescheduling(null);
      refetch();
      toast.success('Appointment rescheduled');
    } catch (err) {
      setError(apiError(err, 'Could not reschedule the appointment'));
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setError('');
    try {
      await deleteAppointment({ id: deleting.id, hospitalId: deleting.hospitalId }).unwrap();
      refetch();
      setDeleting(null);
      toast.success('Appointment deleted');
    } catch (err) {
      setError(apiError(err, 'Could not delete the appointment'));
      setDeleting(null);
    }
  };

  return (
    <DashboardShell
      role={session.user.role}
      userName={session.user.name}
      title="All Appointments"
      subtitle={selectedHospitalId ? 'Filtered by selected hospital' : 'Across every hospital on the platform'}
    >
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Search & filter toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by patient name, doctor name or status…"
            className="w-full pl-9 pr-3 py-2 bg-white rounded-lg shadow text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-white rounded-lg shadow px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-500"
        >
          <option value="all">All Statuses</option>
          <option value="scheduled">Scheduled</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <p className="text-sm text-slate-500">
            {appointments.length} appointment{appointments.length !== 1 ? 's' : ''}
            {(selectedHospitalId || query || statusFilter !== 'all') && <span className="text-slate-400"> (filtered)</span>}
          </p>
          {hasPermission(session, 'appointments.create') && (
            <button
              onClick={() => router.push(selectedHospitalId ? `/dashboard/book?h=${selectedHospitalId}` : '/dashboard/book')}
              className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-cyan-500 to-brand-teal text-white rounded-lg text-sm font-medium hover:shadow-lg transition"
            >
              <Plus className="w-4 h-4" /> Add Appointment
            </button>
          )}
        </div>
        {isLoading ? (
          <div className="py-16 text-center text-slate-400 text-sm">Loading…</div>
        ) : appointments.length === 0 ? (
          <div className="py-16 text-center">
            <CalendarDays className="w-16 h-16 text-slate-200 mx-auto mb-4" />
            <p className="text-slate-500">No appointments found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {showHospital && <th className="text-left py-3 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wide">Hospital</th>}
                  {['Date', 'Time', 'Patient', 'Doctor', 'Status', 'Mode'].map((h) => (
                    <th key={h} className="text-left py-3 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                  ))}
                  <th className="text-right py-3 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody>
                {appointments.map((a) => (
                  <tr key={a.id} className="border-b border-slate-50 hover:bg-slate-50 transition">
                    {showHospital && (
                      <td className="py-3 px-6">
                        <HospitalBadge hospitalId={a.hospitalId} hospitals={hospitals} />
                      </td>
                    )}
                    <td className="py-3 px-6 text-slate-900 text-sm">{a.date}</td>
                    <td className="py-3 px-6 text-slate-600 text-sm">{a.time}</td>
                    <td className="py-3 px-6 text-slate-600 text-sm">{patientName(a.patientId)}</td>
                    <td className="py-3 px-6 text-slate-600 text-sm">{doctorName(a.doctorId)}</td>
                    <td className="py-3 px-6">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_STYLES[a.status] ?? 'bg-slate-100 text-slate-600'}`}>
                        {a.status}
                      </span>
                    </td>
                    <td className="py-3 px-6 text-slate-600 capitalize text-sm">{a.mode ?? 'in-person'}</td>
                    <td className="py-3 px-6 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <ActionIcon icon={Eye} label="View" href={`/appointment/${a.id}${a.hospitalId ? `?h=${a.hospitalId}` : ''}`} />
                        {hasPermission(session, 'appointments.manage') && <ActionIcon icon={Pencil} label="Edit" onClick={() => setEditing(a)} />}
                        {hasPermission(session, 'appointments.manage') && <ActionIcon icon={CalendarClock} label="Reschedule" onClick={() => openReschedule(a)} />}
                        {hasPermission(session, 'appointments.manage') && <ActionIcon icon={CalendarPlus} label="Schedule Follow-Up" onClick={() => setFollowUp(a)} />}
                        {hasPermission(session, 'appointments.manage') && <ActionIcon icon={Activity} label="Add Vitals" onClick={() => setAddingVitals(a)} />}
                        {hasPermission(session, 'appointments.manage') && <ActionIcon icon={Trash2} label="Delete" tone="danger" onClick={() => setDeleting(a)} />}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>


      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-2xl max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-slate-900">Edit Appointment</h3>
              <button onClick={() => setEditing(null)} className="text-slate-500 hover:text-slate-900"><X className="w-5 h-5" /></button>
            </div>
            <Formik
              initialValues={{ doctorId: editing.doctorId, status: editing.status, reason: editing.reason ?? '' }}
              validationSchema={editSchema}
              onSubmit={async (values) => {
                setError('');
                try {
                  await updateAppointment({
                    id: editing.id,
                    hospitalId: editing.hospitalId,
                    body: {
                      doctorId: values.doctorId,
                      departmentId: departmentForDoctor(allDepartments, allDoctors, values.doctorId),
                      status: values.status as Appointment['status'],
                      reason: values.reason,
                    },
                  }).unwrap();
                  setEditing(null);
                  refetch();
                  toast.success('Appointment updated');
                } catch (err) {
                  setError(apiError(err, 'Could not update the appointment'));
                }
              }}
            >
              <Form className="space-y-4">
                <FormField name="doctorId" label="Doctor" as="select" placeholder="Select a doctor" options={doctorOptions} required />
                <FormField name="status" label="Status" as="select" placeholder="Select status" options={statusOptions} required />
                <FormField name="reason" label="Reason" as="textarea" placeholder="Reason for visit" />
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setEditing(null)} className="flex-1 px-4 py-2 bg-slate-200 text-slate-700 rounded hover:bg-slate-300 transition">Cancel</button>
                  <button type="submit" className="flex-1 px-4 py-2 bg-gradient-to-r from-cyan-500 to-brand-teal text-white rounded hover:shadow-lg font-semibold transition">Save Changes</button>
                </div>
              </Form>
            </Formik>
          </div>
        </div>
      )}

      {/* Reschedule modal */}
      {rescheduling && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-2xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-slate-900">Reschedule Appointment</h3>
              <button onClick={() => setRescheduling(null)} className="text-slate-500 hover:text-slate-900"><X className="w-5 h-5" /></button>
            </div>
            <div className="grid sm:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Date</label>
                <Calendar
                  mode="single"
                  selected={reDate ? new Date(`${reDate}T00:00:00`) : undefined}
                  onSelect={(d) => { setReDate(d ? toDateStr(d) : ''); setReTime(''); }}
                  disabled={{ before: new Date(new Date().setHours(0, 0, 0, 0)) }}
                  className="[--cell-size:2rem] rounded-lg border border-slate-200 w-full max-w-full overflow-hidden"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Time slot</label>
                {!reDate ? (
                  <div className="min-h-[180px] flex items-center justify-center text-slate-400 text-sm border border-dashed border-slate-300 rounded-lg">Pick a date</div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {SLOTS.map((slot) => {
                      const st = slotStatus(slot, reDate, reBooked);
                      const selected = reTime === slot && st === 'available';
                      const cls = selected
                        ? 'bg-cyan-600 text-white border-cyan-600'
                        : st === 'available'
                        ? 'bg-white text-slate-700 border-cyan-200 hover:border-cyan-500 hover:bg-cyan-50'
                        : st === 'booked'
                        ? 'bg-red-50 text-red-400 border-red-200 line-through cursor-not-allowed'
                        : 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed';
                      return (
                        <button key={slot} type="button" disabled={st !== 'available'} onClick={() => setReTime(slot)} className={`px-2 py-2 rounded-lg border text-sm font-medium transition ${cls}`}>
                          {slot}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setRescheduling(null)} className="flex-1 px-4 py-2 bg-slate-200 text-slate-700 rounded hover:bg-slate-300 transition">Cancel</button>
              <button onClick={saveReschedule} disabled={!reDate || !reTime} className="flex-1 px-4 py-2 bg-gradient-to-r from-cyan-500 to-brand-teal text-white rounded hover:shadow-lg font-semibold transition disabled:opacity-50">Reschedule</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Vitals modal */}
      {addingVitals && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-2xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-slate-900">Add Vitals</h3>
              <button onClick={() => setAddingVitals(null)} className="text-slate-500 hover:text-slate-900"><X className="w-5 h-5" /></button>
            </div>
            <Formik
              initialValues={{ temperature: '', bloodPressure: '', heartRate: '', respiratoryRate: '', weight: '', height: '', notes: '' }}
              validationSchema={vitalsSchema}
              onSubmit={async (values) => {
                setError('');
                try {
                  await createVitals({
                    hospitalId: addingVitals.hospitalId,
                    appointmentId: addingVitals.id,
                    patientId: addingVitals.patientId,
                    doctorId: addingVitals.doctorId,
                    temperature: Number(values.temperature) || 0,
                    bloodPressure: values.bloodPressure,
                    heartRate: Number(values.heartRate) || 0,
                    respiratoryRate: Number(values.respiratoryRate) || 0,
                    weight: Number(values.weight) || 0,
                    height: Number(values.height) || 0,
                    notes: values.notes,
                  }).unwrap();
                  setAddingVitals(null);
                  toast.success('Vitals recorded');
                } catch (err) {
                  setError(apiError(err, 'Could not record the vitals'));
                }
              }}
            >
              <Form className="grid grid-cols-2 gap-4">
                <FormField name="temperature" label="Temperature (°C)" type="number" placeholder="36.8" />
                <FormField name="bloodPressure" label="Blood Pressure" placeholder="120/80" />
                <FormField name="heartRate" label="Heart Rate (bpm)" type="number" placeholder="78" />
                <FormField name="respiratoryRate" label="Respiratory Rate (/min)" type="number" placeholder="16" />
                <FormField name="weight" label="Weight (kg)" type="number" placeholder="68" />
                <FormField name="height" label="Height (cm)" type="number" placeholder="165" />
                <div className="col-span-2">
                  <FormField name="notes" label="Notes" as="textarea" placeholder="Any observations" />
                </div>
                <div className="col-span-2 flex gap-3 pt-2">
                  <button type="button" onClick={() => setAddingVitals(null)} className="flex-1 px-4 py-2 bg-slate-200 text-slate-700 rounded hover:bg-slate-300 transition">Cancel</button>
                  <button type="submit" className="flex-1 px-4 py-2 bg-gradient-to-r from-cyan-500 to-brand-teal text-white rounded hover:shadow-lg font-semibold transition">Save Vitals</button>
                </div>
              </Form>
            </Formik>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleting && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-2xl max-w-md w-full p-6">
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <div className="min-w-0">
                <h3 className="text-lg font-bold text-slate-900">Delete Appointment</h3>
                <p className="text-slate-600 mt-1 text-sm">
                  Delete the appointment on{' '}
                  <span className="font-semibold text-slate-900">{deleting.date} at {deleting.time}</span>?
                  This cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setDeleting(null)} className="flex-1 px-4 py-2 bg-slate-200 text-slate-700 rounded hover:bg-slate-300 transition">Cancel</button>
              <button onClick={confirmDelete} className="flex-1 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 font-semibold transition">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Follow-up modal */}
      {followUp && (
        <FollowUpModal
          appointment={followUp}
          hospitalId={followUp.hospitalId}
          onClose={() => setFollowUp(null)}
          onCreated={(msg) => { setFollowUp(null); refetch(); toast.success(msg); }}
        />
      )}
    </DashboardShell>
  );
}
