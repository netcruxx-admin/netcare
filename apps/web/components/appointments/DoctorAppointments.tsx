'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import { Search, CalendarDays, Eye, Activity, Pill, X, CheckCircle2, FlaskConical, CalendarPlus } from 'lucide-react';
import { dbOperations, Appointment, Doctor, Patient, User, Medicine, LabTest } from '@/lib/db';
import { DashboardShell } from '@/components/DashboardShell';
import type { RoleViewProps } from '@/components/RoleView';
import { FormField } from '@/components/form/FormField';
import { FollowUpModal } from '@/components/FollowUpModal';
import { ActionIcon } from '@/components/ActionIcon';
import { ExportButton } from '@/components/ExportButton';

const PAGE_SIZE = 20;

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

const rxSchema = Yup.object({
  medicineName: Yup.string().trim().required('Select a medicine'),
  dosage: Yup.string().trim().required('Dosage is required').max(50, 'Too long'),
  frequency: Yup.string().trim().required('Frequency is required').max(50, 'Too long'),
  duration: Yup.string().trim().required('Duration is required').max(50, 'Too long'),
  instructions: Yup.string().max(300, 'Too long'),
});

const statusStyle = (status: Appointment['status']) =>
  status === 'completed'
    ? 'bg-green-100 text-green-700'
    : status === 'cancelled'
    ? 'bg-red-100 text-red-700'
    : 'bg-blue-100 text-blue-700';

interface RawData {
  appointments: Appointment[];
  doctor: Doctor | null;
  patients: Patient[];
  users: User[];
  medicines: Medicine[];
  tests: LabTest[];
}

function fetchRaw(userId: string): RawData {
  const doctor = dbOperations.getAllDoctors().find((d) => d.userId === userId) ?? null;
  return {
    appointments: doctor ? dbOperations.getAppointmentsByDoctorId(doctor.id) : [],
    doctor,
    patients: dbOperations.getAllPatients(),
    users: dbOperations.getAllUsers(),
    medicines: dbOperations.getAllMedicines(),
    tests: dbOperations.getAllLabTests(),
  };
}

export function DoctorAppointments({ session }: RoleViewProps) {
  const router = useRouter();
  const [raw, setRaw] = useState<RawData | null>(null);

  const [status, setStatus] = useState<'all' | Appointment['status']>('all');
  const [query, setQuery] = useState('');
  const [date, setDate] = useState('');
  const [page, setPage] = useState(1);

  const [addingVitals, setAddingVitals] = useState<Appointment | null>(null);
  const [prescribing, setPrescribing] = useState<Appointment | null>(null);
  const [completing, setCompleting] = useState<Appointment | null>(null);
  const [followUp, setFollowUp] = useState<Appointment | null>(null);
  const [orderingTests, setOrderingTests] = useState<Appointment | null>(null);
  const [orderSel, setOrderSel] = useState<Set<string>>(new Set());
  const [orderPriority, setOrderPriority] = useState<'routine' | 'urgent'>('routine');
  const [orderNote, setOrderNote] = useState('');
  const [testQuery, setTestQuery] = useState('');
  const [toast, setToast] = useState('');

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  };

  useEffect(() => {
    const s = session;
    setRaw(fetchRaw(s.user.id));
  }, [session]);

  const reload = () => {
    if (session) setRaw(fetchRaw(session.user.id));
  };

  useEffect(() => {
    setPage(1);
  }, [query, status, date]);

  const rows = useMemo(() => {
    if (!raw) return [];
    const userById = new Map(raw.users.map((u) => [u.id, u]));
    const patientById = new Map(raw.patients.map((p) => [p.id, p]));
    const patientOf = (id: string) => {
      const p = patientById.get(id);
      const u = p ? userById.get(p.userId) : null;
      return { name: u?.name ?? '—', phone: p?.phone || '—' };
    };

    const q = query.trim().toLowerCase();
    return raw.appointments
      .map((a) => {
        const p = patientOf(a.patientId);
        return { appt: a, id: a.id, date: a.date, time: a.time, status: a.status, reason: a.reason || 'Consultation', patient: p.name, phone: p.phone };
      })
      .filter((r) => status === 'all' || r.status === status)
      .filter((r) => !date || r.date === date)
      .filter((r) => !q || r.patient.toLowerCase().includes(q) || r.phone.toLowerCase().includes(q) || r.reason.toLowerCase().includes(q))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }, [raw, status, date, query]);

  const totalPages = Math.ceil(rows.length / PAGE_SIZE);
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const medicineOptions = (raw?.medicines ?? []).map((m) => ({
    value: m.name,
    label: `${m.name}${m.strength ? ` — ${m.strength}` : ''}`,
  }));

  const confirmComplete = () => {
    if (!completing) return;
    dbOperations.updateAppointment(completing.id, { status: 'completed' });
    reload();
    setCompleting(null);
    flash('Appointment marked complete');
  };

  const openOrder = (a: Appointment) => {
    setOrderSel(new Set());
    setOrderPriority('routine');
    setOrderNote('');
    setTestQuery('');
    setOrderingTests(a);
  };
  const toggleTest = (id: string) =>
    setOrderSel((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const saveOrder = () => {
    if (!orderingTests || !raw?.doctor || orderSel.size === 0) return;
    const items = (raw.tests ?? [])
      .filter((t) => orderSel.has(t.id))
      .map((t) => ({ testId: t.id, name: t.name, price: t.price }));
    const now = new Date().toISOString();
    dbOperations.createTestOrder({
      id: `order-${Date.now()}`,
      patientId: orderingTests.patientId,
      doctorId: raw.doctor.id,
      appointmentId: orderingTests.id,
      items,
      status: 'ordered',
      priority: orderPriority,
      clinicalNote: orderNote.trim(),
      orderedAt: now,
      updatedAt: now,
    });
    setOrderingTests(null);
    flash(`Ordered ${items.length} test(s)`);
  };
  const orderTotal = (raw?.tests ?? []).filter((t) => orderSel.has(t.id)).reduce((s, t) => s + t.price, 0);

  return (
    <DashboardShell role={session.user.role} userName={session.user.name} title="Appointments" subtitle="Your patient appointments">
      <div className="space-y-6">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search patient, phone or reason…"
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
          <div className="ml-auto">
            <ExportButton
              filename="my-appointments"
              headers={['Patient', 'Phone', 'Date', 'Time', 'Reason', 'Status']}
              rows={rows.map((r) => [r.patient, r.phone, r.date, r.time, r.reason, r.status])}
            />
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
                      <th className="text-left py-3 px-6 font-semibold text-slate-900">Reason</th>
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
                        <td className="py-3 px-6 text-slate-600 whitespace-nowrap">{r.date} at {r.time}</td>
                        <td className="py-3 px-6 text-slate-600">
                          {r.reason}
                          {r.appt.followUpOf && (
                            <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-cyan-100 text-cyan-700 align-middle">
                              <CalendarPlus className="w-3 h-3" /> Follow-up
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-6">
                          <span className={`inline-block px-3 py-1 rounded-full text-sm font-semibold capitalize ${statusStyle(r.status)}`}>
                            {r.status}
                          </span>
                        </td>
                        <td className="py-3 px-6">
                          <div className="flex items-center justify-end gap-1">
                            <ActionIcon icon={Eye} label="View details" href={`/appointment/${r.id}`} />
                            <ActionIcon icon={Activity} label="Record Vitals" onClick={() => setAddingVitals(r.appt)} />
                            <ActionIcon icon={Pill} label="Add Prescription" onClick={() => setPrescribing(r.appt)} />
                            <ActionIcon icon={FlaskConical} label="Order Tests" onClick={() => openOrder(r.appt)} />
                            <ActionIcon icon={CalendarPlus} label="Schedule Follow-Up" onClick={() => setFollowUp(r.appt)} />
                            {r.status === 'scheduled' && (
                              <ActionIcon icon={CheckCircle2} label="Mark Complete" tone="success" onClick={() => setCompleting(r.appt)} />
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="px-6 py-4 border-t flex items-center justify-center gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-3 py-1.5 rounded border text-sm disabled:opacity-40 hover:bg-slate-50"
                  >
                    Previous
                  </button>
                  <span className="text-sm text-slate-600">{page} / {totalPages}</span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="px-3 py-1.5 rounded border text-sm disabled:opacity-40 hover:bg-slate-50"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Record Vitals modal */}
      {addingVitals && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-2xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-slate-900">Record Vitals</h3>
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

      {/* Add Prescription modal */}
      {prescribing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-2xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-slate-900">Add Prescription</h3>
              <button onClick={() => setPrescribing(null)} className="text-slate-500 hover:text-slate-900">
                <X className="w-5 h-5" />
              </button>
            </div>
            <Formik
              initialValues={{ medicineName: '', dosage: '', frequency: '', duration: '', instructions: '' }}
              validationSchema={rxSchema}
              onSubmit={(values) => {
                dbOperations.createPrescription({
                  id: `rx-${Date.now()}`,
                  appointmentId: prescribing.id,
                  patientId: prescribing.patientId,
                  doctorId: prescribing.doctorId,
                  medicineName: values.medicineName,
                  dosage: values.dosage.trim(),
                  frequency: values.frequency.trim(),
                  duration: values.duration.trim(),
                  instructions: values.instructions.trim(),
                  createdAt: new Date().toISOString(),
                });
                setPrescribing(null);
                flash('Prescription added');
              }}
            >
              <Form className="grid sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <FormField name="medicineName" label="Medicine" as="select" placeholder="Select a medicine" options={medicineOptions} required />
                </div>
                <FormField name="dosage" label="Dosage" placeholder="e.g. 500 mg" required />
                <FormField name="frequency" label="Frequency" placeholder="e.g. Twice a day" required />
                <FormField name="duration" label="Duration" placeholder="e.g. 5 days" required />
                <div className="hidden sm:block" />
                <div className="sm:col-span-2">
                  <FormField name="instructions" label="Instructions" as="textarea" placeholder="e.g. After meals" rows={2} />
                </div>
                <div className="sm:col-span-2 flex gap-3 pt-2">
                  <button type="button" onClick={() => setPrescribing(null)} className="flex-1 px-4 py-2 bg-slate-200 text-slate-700 rounded hover:bg-slate-300 transition">
                    Cancel
                  </button>
                  <button type="submit" className="flex-1 px-4 py-2 bg-gradient-to-r from-cyan-500 to-teal-600 text-white rounded hover:shadow-lg font-semibold transition">
                    Save Prescription
                  </button>
                </div>
              </Form>
            </Formik>
          </div>
        </div>
      )}

      {/* Order Tests modal */}
      {orderingTests && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-2xl max-w-lg w-full max-h-[92vh] flex flex-col">
            <div className="flex justify-between items-center px-6 py-4 border-b">
              <div className="flex items-center gap-2">
                <FlaskConical className="w-5 h-5 text-cyan-600" />
                <h3 className="text-lg font-bold text-slate-900">Order Tests</h3>
              </div>
              <button onClick={() => setOrderingTests(null)} className="text-slate-500 hover:text-slate-900">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 pt-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  value={testQuery}
                  onChange={(e) => setTestQuery(e.target.value)}
                  placeholder="Search tests…"
                  className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-3 space-y-1 min-h-[180px]">
              {(raw?.tests ?? [])
                .filter((t) => !testQuery || t.name.toLowerCase().includes(testQuery.toLowerCase()) || t.category.toLowerCase().includes(testQuery.toLowerCase()))
                .map((t) => {
                  const checked = orderSel.has(t.id);
                  return (
                    <label key={t.id} className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer border ${checked ? 'border-cyan-400 bg-cyan-50' : 'border-transparent hover:bg-slate-50'}`}>
                      <input type="checkbox" checked={checked} onChange={() => toggleTest(t.id)} className="w-4 h-4 accent-cyan-600" />
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-medium text-slate-800 truncate">{t.name}</span>
                        <span className="block text-xs text-slate-500">{t.category} · {t.sampleType}</span>
                      </span>
                      <span className="text-sm text-slate-600 shrink-0">₹{t.price}</span>
                    </label>
                  );
                })}
            </div>

            <div className="px-6 py-4 border-t space-y-3">
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-slate-700">Priority</label>
                <select
                  value={orderPriority}
                  onChange={(e) => setOrderPriority(e.target.value as 'routine' | 'urgent')}
                  className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-cyan-500"
                >
                  <option value="routine">Routine</option>
                  <option value="urgent">Urgent</option>
                </select>
                <span className="ml-auto text-sm text-slate-500">{orderSel.size} selected · ₹{orderTotal}</span>
              </div>
              <input
                value={orderNote}
                onChange={(e) => setOrderNote(e.target.value)}
                placeholder="Clinical note / indication (optional)"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-cyan-500"
              />
              <div className="flex gap-3">
                <button onClick={() => setOrderingTests(null)} className="flex-1 px-4 py-2 bg-slate-200 text-slate-700 rounded hover:bg-slate-300 transition">
                  Cancel
                </button>
                <button
                  onClick={saveOrder}
                  disabled={orderSel.size === 0}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-cyan-500 to-teal-600 text-white rounded hover:shadow-lg font-semibold transition disabled:opacity-50"
                >
                  Place Order
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Complete confirmation modal */}
      {completing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-2xl max-w-md w-full p-6">
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-6 h-6 text-green-600" />
              </div>
              <div className="min-w-0">
                <h3 className="text-lg font-bold text-slate-900">Mark as Complete</h3>
                <p className="text-slate-600 mt-1 text-sm">
                  Mark the appointment on <span className="font-semibold text-slate-900">{completing.date} at {completing.time}</span> as completed?
                </p>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setCompleting(null)} className="flex-1 px-4 py-2 bg-slate-200 text-slate-700 rounded hover:bg-slate-300 transition">
                Cancel
              </button>
              <button onClick={confirmComplete} className="flex-1 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 font-semibold transition">
                Mark Complete
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
