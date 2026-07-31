'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import {
  CalendarDays,
  CalendarClock,
  Clock,
  CheckCircle,
  XCircle,
  Users,
  Stethoscope,
  Building2,
  IndianRupee,
  Wallet,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Label,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { DashboardShell } from '@/components/DashboardShell';
import type { RoleViewProps } from '@/components/RoleView';
import {
  useListAppointmentsQuery,
  useListPaymentsQuery,
  useListDepartmentsQuery,
  useListDoctorsQuery,
  useListPatientsQuery,
} from '@/store/api';
import type { Appointment } from '@/lib/types';

interface Kpi {
  label: string;
  value: string;
  icon: LucideIcon;
  tint: string;
}

const STATUS_COLORS = { scheduled: '#2563eb', completed: '#16a34a', cancelled: '#dc2626' };
const PAYMENT_COLORS = { completed: '#16a34a', pending: '#d97706', failed: '#dc2626' };
const BRAND_CYAN = '#0891b2';
const BRAND_TEAL = '#0d9488';
const BRAND_EMERALD = '#059669';

const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;
const dayFmt = (offset: number) =>
  new Date(Date.now() + offset * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
const shortLabel = (dateStr: string) =>
  new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

function daysBetween(startStr: string, endStr: string) {
  const out: string[] = [];
  const end = new Date(endStr);
  for (let d = new Date(startStr); d <= end; d.setDate(d.getDate() + 1)) {
    out.push(d.toISOString().split('T')[0]);
  }
  return out;
}

const PERIODS: { label: string; value: number | null }[] = [
  { label: '7D', value: 7 },
  { label: '30D', value: 30 },
  { label: '90D', value: 90 },
  { label: 'All', value: null },
];

export function AdminOverview({ session }: RoleViewProps) {
  const router = useRouter();
  const [period, setPeriod] = useState<number | null>(null);
  const [deptId, setDeptId] = useState<string>('all');

  const { data: appointments = [] } = useListAppointmentsQuery();
  const { data: payments = [] } = useListPaymentsQuery();
  const { data: departments = [] } = useListDepartmentsQuery();
  const { data: doctors = [] } = useListDoctorsQuery();
  const { data: patients = [] } = useListPatientsQuery();

  const data = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];

    const doctorById = new Map(doctors.map((d) => [d.id, d]));
    const deptById = new Map(departments.map((d) => [d.id, d]));
    const patientById = new Map(patients.map((p) => [p.id, p]));

    const doctorLabel = (id: string) => {
      const doc = doctorById.get(id);
      return doc ? `Dr. (${doc.specialization || id.slice(-6)})` : '—';
    };
    const patientLabel = (id: string) => {
      const pat = patientById.get(id);
      return pat?.phone ? pat.phone : `#${id.slice(-6)}`;
    };

    let chartStart: string;
    let chartEnd: string;
    if (period) {
      chartStart = dayFmt(-(period - 1));
      chartEnd = today;
    } else {
      const dates = appointments.map((a) => a.date).sort();
      chartStart = dates[0] ?? today;
      chartEnd = dates[dates.length - 1] ?? today;
    }
    const inWindow = (d: string) => (period ? d >= chartStart && d <= today : true);
    const deptMatch = (a: Appointment) => deptId === 'all' || a.departmentId === deptId;

    const scoped = appointments.filter((a) => deptMatch(a) && inWindow(a.date));
    const scopedIds = new Set(scoped.map((a) => a.id));
    const scopedPay = payments.filter((p) => scopedIds.has(p.appointmentId));

    const byStatus = (s: string) => scoped.filter((a) => a.status === s).length;
    const revenue = scopedPay.filter((p) => p.status === 'completed').reduce((x, p) => x + p.amount, 0);
    const pending = scopedPay.filter((p) => p.status === 'pending').reduce((x, p) => x + p.amount, 0);

    const kpis: Kpi[] = [
      { label: 'Total Appointments', value: String(scoped.length), icon: CalendarDays, tint: 'bg-cyan-100 text-cyan-600' },
      { label: "Today's Appointments", value: String(scoped.filter((a) => a.date === today).length), icon: CalendarClock, tint: 'bg-teal-100 text-teal-600' },
      { label: 'Scheduled', value: String(byStatus('scheduled')), icon: Clock, tint: 'bg-blue-100 text-blue-600' },
      { label: 'Completed', value: String(byStatus('completed')), icon: CheckCircle, tint: 'bg-green-100 text-green-600' },
      { label: 'Cancelled', value: String(byStatus('cancelled')), icon: XCircle, tint: 'bg-red-100 text-red-600' },
      { label: 'Patients', value: String(patients.length), icon: Users, tint: 'bg-cyan-100 text-cyan-600' },
      { label: 'Doctors', value: String(doctors.length), icon: Stethoscope, tint: 'bg-teal-100 text-teal-600' },
      { label: 'Departments', value: String(departments.length), icon: Building2, tint: 'bg-indigo-100 text-indigo-600' },
      { label: 'Revenue Collected', value: inr(revenue), icon: IndianRupee, tint: 'bg-emerald-100 text-emerald-600' },
      { label: 'Pending Payments', value: inr(pending), icon: Wallet, tint: 'bg-amber-100 text-amber-600' },
    ];

    const dayList = daysBetween(chartStart, chartEnd);
    const tickInterval = Math.max(0, Math.ceil(dayList.length / 8) - 1);
    const daily = dayList.map((d) => ({ label: shortLabel(d), count: scoped.filter((a) => a.date === d).length }));
    const revenueDaily = dayList.map((d) => ({
      label: shortLabel(d),
      amount: scopedPay
        .filter((p) => p.status === 'completed' && p.createdAt.split('T')[0] === d)
        .reduce((x, p) => x + p.amount, 0),
    }));

    const statusData = [
      { name: 'Scheduled', value: byStatus('scheduled'), color: STATUS_COLORS.scheduled },
      { name: 'Completed', value: byStatus('completed'), color: STATUS_COLORS.completed },
      { name: 'Cancelled', value: byStatus('cancelled'), color: STATUS_COLORS.cancelled },
    ];

    const deptScope = deptId === 'all' ? departments : departments.filter((d) => d.id === deptId);
    const apptById = new Map(appointments.map((a) => [a.id, a]));
    const deptData = deptScope.map((dep) => ({
      name: dep.name,
      count: scoped.filter((a) => a.departmentId === dep.id).length,
    }));
    const revenueByDept = deptScope.map((dep) => ({
      name: dep.name,
      amount: scopedPay
        .filter((p) => p.status === 'completed' && apptById.get(p.appointmentId)?.departmentId === dep.id)
        .reduce((x, p) => x + p.amount, 0),
    }));

    const paymentStatus = [
      { name: 'Completed', value: scopedPay.filter((p) => p.status === 'completed').length, color: PAYMENT_COLORS.completed },
      { name: 'Pending', value: scopedPay.filter((p) => p.status === 'pending').length, color: PAYMENT_COLORS.pending },
      { name: 'Failed', value: scopedPay.filter((p) => p.status === 'failed').length, color: PAYMENT_COLORS.failed },
    ];

    const upcoming = appointments
      .filter((a) => a.status === 'scheduled' && a.date >= today && (deptId === 'all' || a.departmentId === deptId))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
      .slice(0, 6)
      .map((a) => ({
        id: a.id,
        date: a.date,
        time: a.time,
        patient: patientLabel(a.patientId),
        doctor: doctorLabel(a.doctorId),
        dept: deptById.get(a.departmentId)?.name ?? '—',
      }));

    return {
      periodLabel: period ? `Last ${period} Days` : 'All Time',
      kpis,
      daily,
      revenueDaily,
      statusData,
      deptData,
      revenueByDept,
      paymentStatus,
      totalAppts: scoped.length,
      totalPayments: scopedPay.length,
      tickInterval,
      upcoming,
    };
  }, [appointments, payments, departments, doctors, patients, period, deptId]);

  return (
    <DashboardShell
      role={session.user.role}
      userName={session.user.name}
      title="Admin Panel"
      subtitle="Hospital operations at a glance"
    >
      <div className="space-y-8">
        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex bg-white rounded-lg shadow p-1">
            {PERIODS.map((p) => {
              const active = period === p.value;
              return (
                <button
                  key={p.label}
                  onClick={() => setPeriod(p.value)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${
                    active ? 'bg-gradient-to-r from-cyan-500 to-teal-600 text-white shadow' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
          <select
            value={deptId}
            onChange={(e) => setDeptId(e.target.value)}
            className="bg-white rounded-lg shadow px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          >
            <option value="all">All Departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          <span className="text-sm text-slate-500 ml-auto">
            Showing <span className="font-semibold text-slate-700">{data.periodLabel}</span>
          </span>
        </div>

        {/* KPI tiles */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {data.kpis.map((kpi) => {
            const Icon = kpi.icon;
            return (
              <div key={kpi.label} className="bg-white rounded-lg shadow p-5">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${kpi.tint}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <p className="text-2xl font-bold text-slate-900 mt-4">{kpi.value}</p>
                <p className="text-sm text-slate-500">{kpi.label}</p>
              </div>
            );
          })}
        </div>

        {/* Appointments over time */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="font-semibold text-slate-900 mb-1">Appointments — {data.periodLabel}</h3>
          <p className="text-sm text-slate-500 mb-4">Daily appointment volume</p>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={data.daily} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id="apptFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={BRAND_CYAN} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={BRAND_CYAN} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} interval={data.tickInterval} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} width={40} />
              <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }} labelStyle={{ color: '#0f172a', fontWeight: 600 }} />
              <Area type="monotone" dataKey="count" name="Appointments" stroke={BRAND_CYAN} strokeWidth={2} fill="url(#apptFill)" dot={false} activeDot={{ r: 4 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Status + Department breakdowns */}
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="font-semibold text-slate-900 mb-4">Appointments by Status</h3>
            <div className="flex items-center gap-6">
              <ResponsiveContainer width="55%" height={220}>
                <PieChart>
                  <Pie data={data.statusData} dataKey="value" nameKey="name" innerRadius={58} outerRadius={88} paddingAngle={2} stroke="#ffffff" strokeWidth={2}>
                    {data.statusData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                    <Label value={String(data.totalAppts)} position="center" style={{ fontSize: 26, fontWeight: 700, fill: '#0f172a' }} />
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }} />
                </PieChart>
              </ResponsiveContainer>
              <ul className="space-y-3 flex-1">
                {data.statusData.map((s) => (
                  <li key={s.name} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-slate-600">
                      <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: s.color }} />
                      {s.name}
                    </span>
                    <span className="font-semibold text-slate-900">{s.value}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="font-semibold text-slate-900 mb-4">Appointments by Department</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.deptData} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid horizontal={false} stroke="#f1f5f9" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#475569' }} tickLine={false} axisLine={false} width={150} />
                <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }} />
                <Bar dataKey="count" name="Appointments" fill={BRAND_TEAL} radius={[0, 4, 4, 0]} barSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Revenue & payments */}
        <h2 className="text-lg font-bold text-slate-900 pt-2">Revenue &amp; Payments</h2>

        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="font-semibold text-slate-900 mb-1">Revenue Collected — {data.periodLabel}</h3>
          <p className="text-sm text-slate-500 mb-4">Daily collected revenue from completed payments</p>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={data.revenueDaily} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
              <defs>
                <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={BRAND_EMERALD} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={BRAND_EMERALD} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} interval={data.tickInterval} />
              <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} width={56} tickFormatter={(v) => `₹${(v as number) >= 1000 ? `${(v as number) / 1000}k` : v}`} />
              <Tooltip formatter={(v) => [inr(v as number), 'Revenue']} contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }} labelStyle={{ color: '#0f172a', fontWeight: 600 }} />
              <Area type="monotone" dataKey="amount" name="Revenue" stroke={BRAND_EMERALD} strokeWidth={2} fill="url(#revFill)" dot={false} activeDot={{ r: 4 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="font-semibold text-slate-900 mb-4">Revenue by Department</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.revenueByDept} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid horizontal={false} stroke="#f1f5f9" />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} tickFormatter={(v) => `₹${(v as number) >= 1000 ? `${(v as number) / 1000}k` : v}`} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#475569' }} tickLine={false} axisLine={false} width={150} />
                <Tooltip cursor={{ fill: '#f8fafc' }} formatter={(v) => [inr(v as number), 'Revenue']} contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }} />
                <Bar dataKey="amount" name="Revenue" fill={BRAND_EMERALD} radius={[0, 4, 4, 0]} barSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="font-semibold text-slate-900 mb-4">Payments by Status</h3>
            <div className="flex items-center gap-6">
              <ResponsiveContainer width="55%" height={220}>
                <PieChart>
                  <Pie data={data.paymentStatus} dataKey="value" nameKey="name" innerRadius={58} outerRadius={88} paddingAngle={2} stroke="#ffffff" strokeWidth={2}>
                    {data.paymentStatus.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                    <Label value={String(data.totalPayments)} position="center" style={{ fontSize: 26, fontWeight: 700, fill: '#0f172a' }} />
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }} />
                </PieChart>
              </ResponsiveContainer>
              <ul className="space-y-3 flex-1">
                {data.paymentStatus.map((s) => (
                  <li key={s.name} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-slate-600">
                      <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: s.color }} />
                      {s.name}
                    </span>
                    <span className="font-semibold text-slate-900">{s.value}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Upcoming appointments */}
        <div className="bg-white rounded-lg shadow">
          <div className="flex items-center justify-between px-6 py-4 border-b">
            <h3 className="font-semibold text-slate-900">Upcoming Appointments</h3>
            <Link href="/dashboard/appointments" className="text-sm text-cyan-600 hover:text-cyan-700 font-semibold">
              View all →
            </Link>
          </div>
          {data.upcoming.length === 0 ? (
            <div className="text-center py-12 text-slate-500">No upcoming appointments</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-slate-50">
                    <th className="text-left py-3 px-6 font-semibold text-slate-900">Date &amp; Time</th>
                    <th className="text-left py-3 px-6 font-semibold text-slate-900">Patient</th>
                    <th className="text-left py-3 px-6 font-semibold text-slate-900">Doctor</th>
                    <th className="text-left py-3 px-6 font-semibold text-slate-900">Department</th>
                  </tr>
                </thead>
                <tbody>
                  {data.upcoming.map((a) => (
                    <tr key={a.id} className="border-b hover:bg-slate-50">
                      <td className="py-3 px-6 font-medium">{a.date} at {a.time}</td>
                      <td className="py-3 px-6 text-slate-600">{a.patient}</td>
                      <td className="py-3 px-6 text-slate-600">{a.doctor}</td>
                      <td className="py-3 px-6 text-slate-600">{a.dept}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
