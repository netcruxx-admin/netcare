'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  CalendarClock,
  Pill,
  FlaskConical,
  Activity,
  Phone,
  Mail,
  Droplet,
  ShieldAlert,
  HeartPulse,
  CalendarPlus,
  AlertTriangle,
  ClipboardList,
  Fingerprint,
  Baby,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useDashboardGuard } from '@/hooks/useDashboardGuard';
import { adminRole, staffRoles } from '@/lib/roles';
import type { Appointment, MedicationOrder, Patient, User, Vitals, Prescription, TestOrder, TestResult } from '@/lib/types';
import {
  useGetPatientAppointmentsQuery,
  useGetPatientPrescriptionsQuery,
  useGetPatientQuery,
  useGetPatientVitalsQuery,
  useListDepartmentsQuery,
  useListDoctorsQuery,
  useListMedicationOrdersQuery,
  useListTestOrdersQuery,
  useListTestResultsQuery,
} from '@/store/api';
import { DashboardShell } from '@/components/DashboardShell';
import { ORDER_STATUS_LABEL, ORDER_STATUS_STYLE, isAbnormal } from '@/lib/lab';
import { formatPatientAddress, formatRelationLine } from '@/components/patients/patientProfile';
import { maskAadhaar } from '@/lib/aadhaar';
import { fmtAge, fmtDate } from '@/lib/date';
import { daysRemaining, formatGA, gestationalAge, trimester } from '@/lib/anc';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

const todayStr = new Date().toISOString().split('T')[0];

const statusStyle = (status: Appointment['status']) =>
  status === 'completed'
    ? 'bg-green-100 text-green-700'
    : status === 'cancelled'
    ? 'bg-red-100 text-red-700'
    : 'bg-blue-100 text-blue-700';

interface Model {
  patient: Patient;
  patientUser: User | null;
  appointments: (Appointment & { doctor: string; dept: string })[];
  vitals: Vitals[];
  prescriptions: (Prescription & { doctor: string; date: string })[];
  orders: { order: TestOrder; tests: string[]; ready: boolean; abnormal: boolean; date: string }[];
  medicationOrders: MedicationOrder[];
  stats: { total: number; completed: number; upcoming: number; prescriptions: number; tests: number; medOrders: number };
}

export default function PatientDetailPage() {
  const router = useRouter();
  const params = useParams();
  const patientId = params.id as string;

  const session = useDashboardGuard();

  // The API decides what this caller may see: a patient they don't treat 404s,
  // and each sub-resource is narrowed by the same "own" scope.
  const { data: patient, isLoading, isError: notFound } = useGetPatientQuery(patientId, {
    skip: !patientId || !session,
  });
  const { data: rawAppointments = [] } = useGetPatientAppointmentsQuery(patientId, { skip: !patient });
  const { data: rawVitals = [] } = useGetPatientVitalsQuery(patientId, { skip: !patient });
  const { data: rawPrescriptions = [] } = useGetPatientPrescriptionsQuery(patientId, { skip: !patient });
  const { data: rawOrders = [] } = useListTestOrdersQuery({ patientId }, { skip: !patient });
  const { data: rawMedOrders = [] } = useListMedicationOrdersQuery({ patientId }, { skip: !patient });
  // Only this patient's orders' results, in one request.
  const orderIds = rawOrders.map((o) => o.id).join(',');
  const { data: allResults = [] } = useListTestResultsQuery(
    { orderId: orderIds },
    { skip: !patient || !orderIds },
  );
  const { data: doctors = [] } = useListDoctorsQuery(undefined, { skip: !patient });
  const { data: departments = [] } = useListDepartmentsQuery(undefined, { skip: !patient });

  const model: Model | null = useMemo(() => {
    if (!patient) return null;

    const doctorById = new Map(doctors.map((d) => [d.id, d]));
    const deptById = new Map(departments.map((d) => [d.id, d]));
    const doctorName = (id: string) => {
      const name = doctorById.get(id)?.user?.name;
      return name ? `Dr. ${name}` : '—';
    };

    const appointments = [...rawAppointments]
      .map((a) => ({ ...a, doctor: doctorName(a.doctorId), dept: deptById.get(a.departmentId)?.name ?? '—' }))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

    const vitals = [...rawVitals].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

    const prescriptions = [...rawPrescriptions]
      .map((rx) => ({ ...rx, doctor: doctorName(rx.doctorId), date: rx.createdAt.split('T')[0] }))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

    const resultsByOrder = new Map<string, TestResult[]>();
    allResults.forEach((r) => {
      const list = resultsByOrder.get(r.orderId) ?? [];
      list.push(r);
      resultsByOrder.set(r.orderId, list);
    });
    const orders = [...rawOrders]
      .map((o) => {
        const res = resultsByOrder.get(o.id) ?? [];
        return {
          order: o,
          tests: o.items.map((i) => i.name),
          ready: o.status === 'completed' || o.status === 'reviewed',
          abnormal: res.some((r) => r.parameters.some((p) => isAbnormal(p.flag))),
          date: o.orderedAt.split('T')[0],
        };
      })
      .sort((a, b) => (a.order.orderedAt < b.order.orderedAt ? 1 : -1));

    const medicationOrders = [...rawMedOrders].sort((a, b) =>
      a.orderedAt < b.orderedAt ? 1 : -1,
    );

    return {
      patient,
      patientUser: patient.user ?? null,
      appointments,
      vitals,
      prescriptions,
      orders,
      medicationOrders,
      stats: {
        total: appointments.length,
        completed: appointments.filter((a) => a.status === 'completed').length,
        upcoming: appointments.filter((a) => a.status === 'scheduled' && a.date >= todayStr).length,
        prescriptions: prescriptions.length,
        tests: orders.length,
        medOrders: medicationOrders.length,
      },
    };
  }, [patient, rawAppointments, rawVitals, rawPrescriptions, rawOrders, rawMedOrders, allResults, doctors, departments]);

  const role = session?.user.role ?? adminRole;

  if (notFound) {
    return (
      <DashboardShell role={role} userName={session?.user.name ?? ''} title="Patient" subtitle="">
        <div className="bg-white rounded-lg shadow text-center py-16">
          <p className="text-slate-600 mb-4">Patient not found.</p>
          <button onClick={() => router.back()} className="text-cyan-600 font-semibold">Go back</button>
        </div>
      </DashboardShell>
    );
  }

  if (!session) return null;

  if (isLoading || !model) {
    return <DashboardShell role={role} userName={session.user.name} title="Patient Details" loading />;
  }

  const { patient: patientRecord, patientUser } = model;
  const name = patientUser?.name ?? 'Patient';

  const cards: { label: string; value: number; icon: LucideIcon; tint: string }[] = [
    { label: 'Total Visits', value: model.stats.total, icon: CalendarDays, tint: 'text-cyan-600 bg-cyan-50' },
    { label: 'Completed', value: model.stats.completed, icon: CheckCircle2, tint: 'text-green-600 bg-green-50' },
    { label: 'Upcoming', value: model.stats.upcoming, icon: CalendarClock, tint: 'text-blue-600 bg-blue-50' },
    { label: 'Prescriptions', value: model.stats.prescriptions, icon: Pill, tint: 'text-purple-600 bg-purple-50' },
    { label: 'Lab Tests', value: model.stats.tests, icon: FlaskConical, tint: 'text-amber-600 bg-amber-50' },
    { label: 'Med. Orders', value: model.stats.medOrders, icon: ClipboardList, tint: 'text-teal-600 bg-teal-50' },
  ];

  const latest = model.vitals[0];

  return (
    <DashboardShell role={role} userName={session.user.name} title="Patient Details" subtitle={name}>
      <div className="space-y-6">
        <button onClick={() => router.back()} className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 font-medium text-sm">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        {/* Profile header */}
        <div className="bg-white rounded-lg shadow p-6 flex flex-col sm:flex-row sm:items-center gap-5">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-cyan-500 to-brand-teal text-white flex items-center justify-center text-2xl font-bold shrink-0">
            {name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-bold text-slate-900">{name}</h2>
            {formatRelationLine(patientRecord.relationType, patientRecord.relationName) && (
              <p className="text-sm text-slate-500 mt-0.5">
                {formatRelationLine(patientRecord.relationType, patientRecord.relationName)}
              </p>
            )}
            <div className="flex flex-wrap gap-x-5 gap-y-1 mt-1 text-sm text-slate-600">
              <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5 text-slate-400" /> {patientUser?.email ?? '—'}</span>
              <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5 text-slate-400" /> {patientRecord.phone || '—'}</span>
              <span className="flex items-center gap-1"><Droplet className="w-3.5 h-3.5 text-slate-400" /> {patientRecord.bloodGroup || '—'}</span>
              <span className="capitalize">{patientRecord.gender || '—'}{patientRecord.dateOfBirth ? ` · DOB ${patientRecord.dateOfBirth} · ${fmtAge(patientRecord.dateOfBirth)}` : ''}</span>
            </div>
          </div>
        </div>

        {/* Active pregnancy — the one thing this chart used to have no idea
            about, even though /pregnancies has always known. */}
        {patientRecord.activePregnancy && (
          <PregnancyCard pregnancy={patientRecord.activePregnancy} />
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
          {cards.map((c) => {
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

        {/* Clinical info */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2"><HeartPulse className="w-5 h-5 text-cyan-600" /> Medical Profile</h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4 text-sm">
            <Info label="Allergies" value={patientRecord.allergies} icon={ShieldAlert} highlight={!!patientRecord.allergies && patientRecord.allergies.toLowerCase() !== 'none' && !patientRecord.allergies.toLowerCase().includes('no known')} />
            <Info label="Chronic Diseases" value={patientRecord.chronicDiseases} />
            <Info label="Medical History" value={patientRecord.medicalHistory} />
            <Info label="Emergency Contact" value={patientRecord.emergencyContact ? `${patientRecord.emergencyContact}${patientRecord.emergencyRelationship ? ` (${patientRecord.emergencyRelationship})` : ''}${patientRecord.emergencyPhone ? ` · ${patientRecord.emergencyPhone}` : ''}` : ''} />
            <Info label="Insurance Provider" value={patientRecord.insuranceProvider} />
            <Info label="Insurance Number" value={patientRecord.insuranceNumber} />
          </div>
        </div>

        {/* Who and where — collected at registration, and the two things the
            desk reaches for when a patient turns up without their papers. */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <Fingerprint className="w-5 h-5 text-cyan-600" /> Identity &amp; Address
          </h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4 text-sm">
            {/* Masked: the last four confirm the right number is on file, and
                the full one is in the edit form for whoever has to correct it. */}
            <Info label="Aadhaar" value={maskAadhaar(patientRecord.aadhaarNumber)} />
            <Info label="Address" value={formatPatientAddress(patientRecord)} />
            <Info label="PIN Code" value={patientRecord.pincode} />
          </div>
        </div>

        {/* Latest vitals highlight */}
        {latest && (
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2"><Activity className="w-5 h-5 text-cyan-600" /> Latest Vitals <span className="text-xs font-normal text-slate-400">({latest.createdAt.split('T')[0]})</span></h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              <Vital label="BP" value={latest.bloodPressure || '—'} />
              <Vital label="Height" value={latest.height ? `${latest.height} cm` : '—'} />
              <Vital label="Pulse" value={latest.heartRate ? `${latest.heartRate} bpm` : '—'} />
              <Vital label="Weight" value={latest.weight ? `${latest.weight} kg` : '—'} />
              <Vital label="Temp" value={latest.temperature ? `${latest.temperature}°F` : '—'} />
              <Vital label="BMI" value={latest.bmi ? `${latest.bmi}` : '—'} />
              <Vital label="LMP" value={fmtDate(latest.lmp)} />
              <Vital label="EDD" value={fmtDate(latest.edd)} />
              <Vital label="POG" value={latest.pog || '—'} />
            </div>
          </div>
        )}

        {/* Appointments */}
        <Section title="Appointment History" icon={CalendarDays} count={model.appointments.length}>
          {model.appointments.length === 0 ? (
            <Empty text="No appointments." />
          ) : (
            <TableWrap head={['Date & Time', 'Doctor', 'Reason', 'Status', '']}>
              {model.appointments.map((a) => (
                <TableRow key={a.id} className="border-b hover:bg-slate-50">
                  <TableCell className="py-3 px-6 text-slate-600">{a.date} at {a.time}</TableCell>
                  <TableCell className="py-3 px-6 text-slate-600 whitespace-normal">{a.doctor}</TableCell>
                  <TableCell className="py-3 px-6 text-slate-600 whitespace-normal">
                    {a.reason || 'Consultation'}
                    {a.followUpOf && (
                      <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-cyan-100 text-cyan-700 align-middle">
                        <CalendarPlus className="w-3 h-3" /> Follow-up
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="py-3 px-6 whitespace-normal">
                    <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold capitalize ${statusStyle(a.status)}`}>{a.status}</span>
                  </TableCell>
                  <TableCell className="py-3 px-6 text-right whitespace-normal">
                    <Link href={`/appointment/${a.id}`} className="text-cyan-600 hover:text-cyan-700 font-semibold text-sm">View</Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableWrap>
          )}
        </Section>

        {/* Vitals history */}
        <Section title="Vitals History" icon={Activity} count={model.vitals.length}>
          {model.vitals.length === 0 ? (
            <Empty text="No vitals recorded." />
          ) : (
            <TableWrap head={['Date', 'BP', 'Height', 'Pulse', 'Weight', 'Temp', 'BMI', 'LMP', 'EDD', 'POG']}>
              {model.vitals.map((v) => (
                <TableRow key={v.id} className="border-b hover:bg-slate-50">
                  <TableCell className="py-3 px-6 text-slate-600">{v.createdAt.split('T')[0]}</TableCell>
                  <TableCell className="py-3 px-6 text-slate-600 whitespace-normal">{v.bloodPressure || '—'}</TableCell>
                  <TableCell className="py-3 px-6 text-slate-600 whitespace-normal">{v.height ? `${v.height} cm` : '—'}</TableCell>
                  <TableCell className="py-3 px-6 text-slate-600 whitespace-normal">{v.heartRate ? `${v.heartRate} bpm` : '—'}</TableCell>
                  <TableCell className="py-3 px-6 text-slate-600 whitespace-normal">{v.weight ? `${v.weight} kg` : '—'}</TableCell>
                  <TableCell className="py-3 px-6 text-slate-600 whitespace-normal">{v.temperature ? `${v.temperature}°F` : '—'}</TableCell>
                  <TableCell className="py-3 px-6 text-slate-600 whitespace-normal">{v.bmi ? `${v.bmi}` : '—'}</TableCell>
                  <TableCell className="py-3 px-6 text-slate-600 whitespace-normal">{fmtDate(v.lmp)}</TableCell>
                  <TableCell className="py-3 px-6 text-slate-600 whitespace-normal">{fmtDate(v.edd)}</TableCell>
                  <TableCell className="py-3 px-6 text-slate-600 whitespace-normal">{v.pog || '—'}</TableCell>
                </TableRow>
              ))}
            </TableWrap>
          )}
        </Section>

        {/* Prescriptions */}
        <Section title="Prescriptions" icon={Pill} count={model.prescriptions.length}>
          {model.prescriptions.length === 0 ? (
            <Empty text="No prescriptions." />
          ) : (
            <TableWrap head={['Date', 'Medicine', 'Dosage', 'Frequency', 'Duration', 'Prescribed by']}>
              {model.prescriptions.map((rx) => (
                <TableRow key={rx.id} className="border-b hover:bg-slate-50">
                  <TableCell className="py-3 px-6 text-slate-600">{rx.date}</TableCell>
                  <TableCell className="py-3 px-6 whitespace-normal">
                    <span className="inline-flex items-center gap-1.5 font-medium text-slate-900"><Pill className="w-4 h-4 text-cyan-600" /> {rx.medicineName}</span>
                    {rx.instructions && <p className="text-xs text-slate-500 mt-0.5">{rx.instructions}</p>}
                  </TableCell>
                  <TableCell className="py-3 px-6 text-slate-600 whitespace-normal">{rx.dosage}</TableCell>
                  <TableCell className="py-3 px-6 text-slate-600 whitespace-normal">{rx.frequency}</TableCell>
                  <TableCell className="py-3 px-6 text-slate-600 whitespace-normal">{rx.duration}</TableCell>
                  <TableCell className="py-3 px-6 text-slate-600 whitespace-normal">{rx.doctor}</TableCell>
                </TableRow>
              ))}
            </TableWrap>
          )}
        </Section>

        {/* Medication Orders */}
        <Section title="Medication Orders" icon={ClipboardList} count={model.medicationOrders.length}>
          {model.medicationOrders.length === 0 ? (
            <Empty text="No medication orders." />
          ) : (
            <TableWrap head={['Date', 'Medicine', 'Dosage', 'Route', 'Doctor', 'Status', 'Notes']}>
              {model.medicationOrders.map((o) => (
                <TableRow key={o.id} className="border-b hover:bg-slate-50">
                  <TableCell className="py-3 px-6 text-slate-600">{o.orderedAt.split('T')[0]}</TableCell>
                  <TableCell className="py-3 px-6 font-medium text-slate-900 whitespace-normal">{o.medicineName}</TableCell>
                  <TableCell className="py-3 px-6 text-slate-600 whitespace-normal">{o.dosage}</TableCell>
                  <TableCell className="py-3 px-6 whitespace-normal">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
                      ['IV','IM','SC'].includes(o.route)
                        ? 'bg-orange-100 text-orange-700'
                        : 'bg-slate-100 text-slate-600'
                    }`}>{o.route}</span>
                  </TableCell>
                  <TableCell className="py-3 px-6 text-slate-600 whitespace-normal">{o.doctorName ?? '—'}</TableCell>
                  <TableCell className="py-3 px-6 whitespace-normal">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                      o.status === 'administered' ? 'bg-green-100 text-green-700' :
                      o.status === 'dispensed'    ? 'bg-blue-100 text-blue-700' :
                      o.status === 'cancelled'    ? 'bg-slate-100 text-slate-500' :
                                                    'bg-amber-100 text-amber-700'
                    }`}>{o.status}</span>
                  </TableCell>
                  <TableCell className="py-3 px-6 text-slate-500 max-w-xs truncate">{o.notes || '—'}</TableCell>
                </TableRow>
              ))}
            </TableWrap>
          )}
        </Section>

        {/* Test reports */}
        <Section title="Test Reports" icon={FlaskConical} count={model.orders.length}>
          {model.orders.length === 0 ? (
            <Empty text="No lab tests ordered." />
          ) : (
            <div className="divide-y">
              {model.orders.map((r) => (
                <div key={r.order.id} className="px-6 py-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${ORDER_STATUS_STYLE[r.order.status]}`}>{ORDER_STATUS_LABEL[r.order.status]}</span>
                      {r.abnormal && r.ready && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700"><AlertTriangle className="w-3 h-3" /> Abnormal</span>
                      )}
                      <span className="text-xs text-slate-400">Ordered {r.date}</span>
                    </div>
                    <p className="text-sm text-slate-700 mt-1">{r.tests.join(', ')}</p>
                  </div>
                  {r.ready ? (
                    <Link href={`/print/lab-report/${r.order.id}`} className="text-cyan-600 hover:text-cyan-700 font-semibold text-sm shrink-0">View Report</Link>
                  ) : (
                    <span className="text-sm text-slate-400 shrink-0">Pending</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>
    </DashboardShell>
  );
}

function PregnancyCard({ pregnancy }: { pregnancy: NonNullable<Patient['activePregnancy']> }) {
  const ga = gestationalAge(pregnancy.lmp);
  const tri = trimester(ga.weeks);
  return (
    <div className="bg-white rounded-lg shadow p-6 border-l-4 border-cyan-500">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h3 className="font-semibold text-slate-900 flex items-center gap-2">
          <Baby className="w-5 h-5 text-cyan-600" /> Active Pregnancy
        </h3>
        <Link href="/dashboard/pregnancies" className="text-sm font-semibold text-cyan-600 hover:text-cyan-700">
          View antenatal record →
        </Link>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Vital label="Gestational age" value={`${formatGA(ga)} · Tri ${tri}`} />
        <Vital label="EDD" value={fmtDate(pregnancy.edd)} />
        <Vital label="Due in" value={`${daysRemaining(ga.totalDays)} days`} />
        <Vital label="Gravida / Para" value={`G${pregnancy.gravida} P${pregnancy.para}`} />
      </div>
      {pregnancy.riskFactors.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {pregnancy.riskFactors.map((rf) => (
            <span
              key={rf}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800"
            >
              <AlertTriangle className="w-3 h-3" /> {rf}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Info({ label, value, icon: Icon, highlight }: { label: string; value: string; icon?: LucideIcon; highlight?: boolean }) {
  const display = value || 'None';
  return (
    <div>
      <p className="text-slate-500 text-xs mb-0.5 flex items-center gap-1">{Icon && <Icon className="w-3.5 h-3.5" />} {label}</p>
      <p className={`font-medium ${highlight ? 'text-red-600' : display === 'None' ? 'text-slate-400' : 'text-slate-900'}`}>{display}</p>
    </div>
  );
}

function Vital({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-50 rounded-lg p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function Section({ title, icon: Icon, count, children }: { title: string; icon: LucideIcon; count: number; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg shadow">
      <div className="px-6 py-4 border-b flex items-center gap-2">
        <Icon className="w-5 h-5 text-cyan-600" />
        <h3 className="font-semibold text-slate-900">{title}</h3>
        <span className="text-sm text-slate-400">({count})</span>
      </div>
      {children}
    </div>
  );
}

function TableWrap({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="border-b bg-slate-50">
            {head.map((h, i) => (
              <TableHead key={i} className={`py-3 px-6 font-semibold text-slate-900 ${i === head.length - 1 && h === '' ? 'text-right' : 'text-left'}`}>{h}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>{children}</TableBody>
      </Table>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="text-center py-10 text-slate-500 text-sm">{text}</div>;
}
