'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import {
  Search,
  CalendarDays,
  Plus,
  Eye,
  Pencil,
  Activity,
  Trash2,
  X,
  AlertTriangle,
  CalendarCheck,
  CalendarClock,
  CalendarPlus,
  CheckCircle2,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { authStorage } from '@/lib/auth';
import { dbOperations, Appointment, Department, Doctor, Patient, User } from '@/lib/db';
import { DashboardShell } from '@/components/DashboardShell';
import { FormField } from '@/components/form/FormField';
import { FollowUpModal } from '@/components/FollowUpModal';
import { ActionIcon } from '@/components/ActionIcon';
import { ExportButton } from '@/components/ExportButton';
import { blockedSlotSet } from '@/lib/schedule';
import { Calendar } from '@/components/ui/calendar';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationPrevious,
  PaginationNext,
  PaginationEllipsis,
} from '@/components/ui/pagination';

const PAGE_SIZE = 20;

// ---- slot helpers (shared behaviour with the booking form) ----
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
const todayStr = toDateStr(new Date());
const SLOTS = [
  '09:00 AM', '09:30 AM', '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM',
  '12:00 PM', '01:00 PM', '02:00 PM', '02:30 PM', '03:00 PM', '03:30 PM',
  '04:00 PM', '04:30 PM',
];
const BREAK_SLOTS = new Set(['12:00 PM', '01:00 PM']);
type SlotStatus = 'available' | 'booked' | 'blocked';
function slotStatus(slot: string, date: string, booked: Set<string>, blocked: Set<string>): SlotStatus {
  if (BREAK_SLOTS.has(slot) || blocked.has(slot)) return 'blocked';
  if (date === todayStr) {
    const now = new Date();
    if (slotToMinutes(slot) <= now.getHours() * 60 + now.getMinutes()) return 'blocked';
  }
  if (booked.has(slot)) return 'booked';
  return 'available';
}
function bookedSlotsForDoctor(doctorId: string, date: string, excludeId?: string) {
  if (!doctorId || !date) return new Set<string>();
  return new Set(
    dbOperations
      .getAppointmentsByDoctorId(doctorId)
      .filter((a) => a.date === date && a.status === 'scheduled' && a.id !== excludeId)
      .map((a) => a.time),
  );
}
function departmentForDoctor(doctorId: string) {
  const doc = dbOperations.getDoctorById(doctorId);
  const depts = dbOperations.getAllDepartments();
  return depts.find((d) => d.name === doc?.specialization)?.id ?? depts[0]?.id ?? 'dept-1';
}

const numOpt = Yup.number()
  .transform((v, o) => (o === '' ? undefined : v))
  .typeError('Must be a number')
  .min(0, 'Cannot be negative');

const editSchema = Yup.object({
  doctorId: Yup.string().required('Select a doctor'),
  status: Yup.string().oneOf(['scheduled', 'completed', 'cancelled']).required('Select a status'),
  reason: Yup.string().max(200, 'Too long'),
});
const vitalsSchema = Yup.object({
  temperature: numOpt,
  heartRate: numOpt,
  respiratoryRate: numOpt,
  weight: numOpt,
  height: numOpt,
  bloodPressure: Yup.string().max(15, 'Too long'),
  notes: Yup.string().max(300, 'Too long'),
});

const statusStyle = (status: Appointment['status']) =>
  status === 'completed'
    ? 'bg-green-100 text-green-700'
    : status === 'cancelled'
    ? 'bg-red-100 text-red-700'
    : 'bg-blue-100 text-blue-700';

const statusOptions = [
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

interface RawData {
  appointments: Appointment[];
  departments: Department[];
  doctors: Doctor[];
  patients: Patient[];
  users: User[];
}

function buildPageItems(current: number, total: number): (number | 'ellipsis')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const set = new Set(
    [1, total, current, current - 1, current + 1].filter((p) => p >= 1 && p <= total),
  );
  const sorted = [...set].sort((a, b) => a - b);
  const items: (number | 'ellipsis')[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) items.push('ellipsis');
    items.push(sorted[i]);
  }
  return items;
}

function fetchRaw(): RawData {
  return {
    appointments: dbOperations.getAllAppointments(),
    departments: dbOperations.getAllDepartments(),
    doctors: dbOperations.getAllDoctors(),
    patients: dbOperations.getAllPatients(),
    users: dbOperations.getAllUsers(),
  };
}

export default function AdminAppointmentsPage() {
  const router = useRouter();
  const [session, setSession] = useState<ReturnType<typeof authStorage.getSession>>(null);
  const [raw, setRaw] = useState<RawData | null>(null);

  const [status, setStatus] = useState<'all' | Appointment['status']>('all');
  const [deptId, setDeptId] = useState('all');
  const [query, setQuery] = useState('');
  const [date, setDate] = useState('');
  const [page, setPage] = useState(1);

  // Action modals (each holds the target appointment)
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [followUp, setFollowUp] = useState<Appointment | null>(null);
  const [rescheduling, setRescheduling] = useState<Appointment | null>(null);
  const [reDate, setReDate] = useState('');
  const [reTime, setReTime] = useState('');
  const [addingVitals, setAddingVitals] = useState<Appointment | null>(null);
  const [deleting, setDeleting] = useState<Appointment | null>(null);
  const [toast, setToast] = useState('');

  const reload = () => setRaw(fetchRaw());
  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  };

  useEffect(() => {
    const session = authStorage.getSession();
    if (!session || session.user.role !== 'admin') {
      router.push('/login');
      return;
    }
    setSession(session);
    setRaw(fetchRaw());
  }, [router]);

  useEffect(() => {
    setPage(1);
  }, [query, status, deptId, date]);

  const rows = useMemo(() => {
    if (!raw) return [];
    const userById = new Map(raw.users.map((u) => [u.id, u]));
    const doctorById = new Map(raw.doctors.map((d) => [d.id, d]));
    const patientById = new Map(raw.patients.map((p) => [p.id, p]));
    const deptById = new Map(raw.departments.map((d) => [d.id, d]));

    const doctorName = (id: string) => {
      const u = doctorById.get(id) ? userById.get(doctorById.get(id)!.userId) : null;
      return u ? `Dr. ${u.name}` : '—';
    };
    const patientOf = (id: string) => {
      const p = patientById.get(id);
      const u = p ? userById.get(p.userId) : null;
      return { name: u?.name ?? '—', phone: p?.phone || '—' };
    };

    const q = query.trim().toLowerCase();
    return raw.appointments
      .map((a) => {
        const p = patientOf(a.patientId);
        return {
          appt: a,
          id: a.id,
          date: a.date,
          time: a.time,
          status: a.status,
          patient: p.name,
          phone: p.phone,
          doctor: doctorName(a.doctorId),
          dept: deptById.get(a.departmentId)?.name ?? '—',
          departmentId: a.departmentId,
        };
      })
      .filter((r) => status === 'all' || r.status === status)
      .filter((r) => deptId === 'all' || r.departmentId === deptId)
      .filter((r) => !date || r.date === date)
      .filter(
        (r) =>
          !q ||
          r.patient.toLowerCase().includes(q) ||
          r.doctor.toLowerCase().includes(q) ||
          r.phone.toLowerCase().includes(q),
      )
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }, [raw, status, deptId, date, query]);

  const stats = useMemo(() => {
    const appts = raw?.appointments ?? [];
    return {
      total: appts.length,
      scheduled: appts.filter((a) => a.status === 'scheduled').length,
      completed: appts.filter((a) => a.status === 'completed').length,
      rescheduled: appts.filter((a) => a.rescheduled).length,
      cancelled: appts.filter((a) => a.status === 'cancelled').length,
    };
  }, [raw]);

  const totalPages = Math.ceil(rows.length / PAGE_SIZE);
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pageItems = buildPageItems(page, totalPages);

  if (!session) {
    return null;
  }

  const doctorOptions = (raw?.doctors ?? []).map((d) => {
    const u = raw?.users.find((x) => x.id === d.userId);
    return { value: d.id, label: `Dr. ${u?.name ?? 'Doctor'} — ${d.specialization}` };
  });

  const openReschedule = (a: Appointment) => {
    setReDate(a.date);
    setReTime(a.time);
    setRescheduling(a);
  };
  const saveReschedule = () => {
    if (!rescheduling || !reDate || !reTime) return;
    dbOperations.updateAppointment(rescheduling.id, { date: reDate, time: reTime, rescheduled: true });
    reload();
    setRescheduling(null);
    flash('Appointment rescheduled');
  };
  const confirmDelete = () => {
    if (!deleting) return;
    dbOperations.deleteAppointment(deleting.id);
    reload();
    setDeleting(null);
    flash('Appointment deleted');
  };

  const reBooked = rescheduling ? bookedSlotsForDoctor(rescheduling.doctorId, reDate, rescheduling.id) : new Set<string>();
  const reBlocked = rescheduling ? blockedSlotSet(rescheduling.doctorId, reDate, SLOTS) : new Set<string>();

  return (
    <DashboardShell
      role="admin"
      userName={session.user.name}
      title="Appointments"
      subtitle="All appointments across the hospital"
    >
      <div className="space-y-6">
        {/* Stat cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {(
            [
              { label: 'Total', value: stats.total, icon: CalendarCheck, tint: 'text-cyan-600 bg-cyan-50' },
              { label: 'Scheduled', value: stats.scheduled, icon: CalendarClock, tint: 'text-blue-600 bg-blue-50' },
              { label: 'Completed', value: stats.completed, icon: CheckCircle2, tint: 'text-green-600 bg-green-50' },
              { label: 'Rescheduled', value: stats.rescheduled, icon: RefreshCw, tint: 'text-amber-600 bg-amber-50' },
              { label: 'Cancelled', value: stats.cancelled, icon: XCircle, tint: 'text-red-600 bg-red-50' },
            ] as { label: string; value: number; icon: LucideIcon; tint: string }[]
          ).map((c) => {
            const Icon = c.icon;
            return (
              <div key={c.label} className="bg-white rounded-lg shadow p-4 flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${c.tint}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-2xl font-bold text-slate-900 leading-tight">{c.value}</p>
                  <p className="text-xs text-slate-500">{c.label}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search patient, phone or doctor…"
              className="w-full pl-9 pr-3 py-2 bg-white rounded-lg shadow text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
            className="bg-white rounded-lg shadow px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          >
            <option value="all">All Statuses</option>
            <option value="scheduled">Scheduled</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <select
            value={deptId}
            onChange={(e) => setDeptId(e.target.value)}
            className="bg-white rounded-lg shadow px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          >
            <option value="all">All Departments</option>
            {raw?.departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-white rounded-lg shadow px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
            {date && (
              <button onClick={() => setDate('')} className="text-sm text-cyan-600 hover:text-cyan-700 font-medium">
                Clear
              </button>
            )}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <ExportButton
              filename="appointments"
              headers={['Patient', 'Phone', 'Date', 'Time', 'Doctor', 'Department', 'Status']}
              rows={rows.map((r) => [r.patient, r.phone, r.date, r.time, r.doctor, r.dept, r.status])}
            />
            <Link
              href="/dashboard/admin/book"
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-500 to-teal-600 text-white rounded-lg text-sm font-semibold hover:shadow-lg transition"
            >
              <Plus className="w-4 h-4" /> New Appointment
            </Link>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">Appointments ({rows.length})</h3>
            {totalPages > 1 && <span className="text-sm text-slate-500">Page {page} of {totalPages}</span>}
          </div>
          {rows.length === 0 ? (
            <div className="text-center py-16">
              <CalendarDays className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-600">No appointments match your filters.</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-slate-50">
                      <th className="text-left py-3 px-6 font-semibold text-slate-900">Patient</th>
                      <th className="text-left py-3 px-6 font-semibold text-slate-900">Date &amp; Time</th>
                      <th className="text-left py-3 px-6 font-semibold text-slate-900">Doctor</th>
                      <th className="text-left py-3 px-6 font-semibold text-slate-900">Department</th>
                      <th className="text-left py-3 px-6 font-semibold text-slate-900">Status</th>
                      <th className="text-right py-3 px-6 font-semibold text-slate-900">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((r) => (
                      <tr key={r.id} className="border-b hover:bg-slate-50">
                        <td className="py-3 px-6">
                          <p className="font-medium text-slate-900">{r.patient}</p>
                          <p className="text-xs text-slate-500">{r.phone}</p>
                        </td>
                        <td className="py-3 px-6 text-slate-600 whitespace-nowrap">
                          {r.date} at {r.time}
                          {r.appt.followUpOf && (
                            <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-cyan-100 text-cyan-700 align-middle">
                              <CalendarPlus className="w-3 h-3" /> Follow-up
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-6 text-slate-600">{r.doctor}</td>
                        <td className="py-3 px-6 text-slate-600">{r.dept}</td>
                        <td className="py-3 px-6">
                          <span className={`inline-block px-3 py-1 rounded-full text-sm font-semibold capitalize ${statusStyle(r.status)}`}>
                            {r.status}
                          </span>
                        </td>
                        <td className="py-3 px-6">
                          <div className="flex items-center justify-end gap-1">
                            <ActionIcon icon={Eye} label="View" href={`/appointment/${r.id}`} />
                            <ActionIcon icon={Pencil} label="Edit" onClick={() => setEditing(r.appt)} />
                            <ActionIcon icon={CalendarClock} label="Reschedule" onClick={() => openReschedule(r.appt)} />
                            <ActionIcon icon={CalendarPlus} label="Schedule Follow-Up" onClick={() => setFollowUp(r.appt)} />
                            <ActionIcon icon={Activity} label="Add Vitals" onClick={() => setAddingVitals(r.appt)} />
                            <ActionIcon icon={Trash2} label="Delete" tone="danger" onClick={() => setDeleting(r.appt)} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="px-6 py-4 border-t">
                  <Pagination>
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious
                          href="#"
                          onClick={(e) => { e.preventDefault(); if (page > 1) setPage(page - 1); }}
                          className={page === 1 ? 'pointer-events-none opacity-40' : ''}
                        />
                      </PaginationItem>
                      {pageItems.map((item, i) =>
                        item === 'ellipsis' ? (
                          <PaginationItem key={`ellipsis-${i}`}>
                            <PaginationEllipsis />
                          </PaginationItem>
                        ) : (
                          <PaginationItem key={item}>
                            <PaginationLink href="#" isActive={item === page} onClick={(e) => { e.preventDefault(); setPage(item); }}>
                              {item}
                            </PaginationLink>
                          </PaginationItem>
                        ),
                      )}
                      <PaginationItem>
                        <PaginationNext
                          href="#"
                          onClick={(e) => { e.preventDefault(); if (page < totalPages) setPage(page + 1); }}
                          className={page === totalPages ? 'pointer-events-none opacity-40' : ''}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-2xl max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-slate-900">Edit Appointment</h3>
              <button onClick={() => setEditing(null)} className="text-slate-500 hover:text-slate-900">
                <X className="w-5 h-5" />
              </button>
            </div>
            <Formik
              initialValues={{ doctorId: editing.doctorId, status: editing.status, reason: editing.reason }}
              validationSchema={editSchema}
              onSubmit={(values) => {
                dbOperations.updateAppointment(editing.id, {
                  doctorId: values.doctorId,
                  departmentId: departmentForDoctor(values.doctorId),
                  status: values.status as Appointment['status'],
                  reason: values.reason,
                });
                reload();
                setEditing(null);
                flash('Appointment updated');
              }}
            >
              <Form className="space-y-4">
                <FormField name="doctorId" label="Doctor" as="select" placeholder="Select a doctor" options={doctorOptions} required />
                <FormField name="status" label="Status" as="select" placeholder="Select status" options={statusOptions} required />
                <FormField name="reason" label="Reason" as="textarea" placeholder="Reason for visit" rows={3} />
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setEditing(null)} className="flex-1 px-4 py-2 bg-slate-200 text-slate-700 rounded hover:bg-slate-300 transition">
                    Cancel
                  </button>
                  <button type="submit" className="flex-1 px-4 py-2 bg-gradient-to-r from-cyan-500 to-teal-600 text-white rounded hover:shadow-lg font-semibold transition">
                    Save Changes
                  </button>
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
              <button onClick={() => setRescheduling(null)} className="text-slate-500 hover:text-slate-900">
                <X className="w-5 h-5" />
              </button>
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
                      const st = slotStatus(slot, reDate, reBooked, reBlocked);
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
              <button onClick={() => setRescheduling(null)} className="flex-1 px-4 py-2 bg-slate-200 text-slate-700 rounded hover:bg-slate-300 transition">
                Cancel
              </button>
              <button
                onClick={saveReschedule}
                disabled={!reDate || !reTime}
                className="flex-1 px-4 py-2 bg-gradient-to-r from-cyan-500 to-teal-600 text-white rounded hover:shadow-lg font-semibold transition disabled:opacity-50"
              >
                Reschedule
              </button>
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
              <button onClick={() => setAddingVitals(null)} className="text-slate-500 hover:text-slate-900">
                <X className="w-5 h-5" />
              </button>
            </div>
            <Formik
              initialValues={{ temperature: '', bloodPressure: '', heartRate: '', respiratoryRate: '', weight: '', height: '', notes: '' }}
              validationSchema={vitalsSchema}
              onSubmit={(values) => {
                dbOperations.createVitals({
                  id: `v-${Date.now()}`,
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
                  createdAt: new Date().toISOString(),
                });
                setAddingVitals(null);
                flash('Vitals recorded');
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
                  <FormField name="notes" label="Notes" as="textarea" placeholder="Any observations" rows={2} />
                </div>
                <div className="col-span-2 flex gap-3 pt-2">
                  <button type="button" onClick={() => setAddingVitals(null)} className="flex-1 px-4 py-2 bg-slate-200 text-slate-700 rounded hover:bg-slate-300 transition">
                    Cancel
                  </button>
                  <button type="submit" className="flex-1 px-4 py-2 bg-gradient-to-r from-cyan-500 to-teal-600 text-white rounded hover:shadow-lg font-semibold transition">
                    Save Vitals
                  </button>
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
                  Delete the appointment on <span className="font-semibold text-slate-900">{deleting.date} at {deleting.time}</span>? This cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setDeleting(null)} className="flex-1 px-4 py-2 bg-slate-200 text-slate-700 rounded hover:bg-slate-300 transition">
                Cancel
              </button>
              <button onClick={confirmDelete} className="flex-1 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 font-semibold transition">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Follow-up modal */}
      {followUp && (
        <FollowUpModal
          appointment={followUp}
          onClose={() => setFollowUp(null)}
          onCreated={(msg) => { reload(); setFollowUp(null); flash(msg); }}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white text-sm px-4 py-2 rounded-lg shadow-lg">
          {toast}
        </div>
      )}
    </DashboardShell>
  );
}
