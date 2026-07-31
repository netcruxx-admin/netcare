'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { Baby, CalendarClock, Activity, AlertTriangle, CheckCircle2, Circle } from 'lucide-react';
import { dbOperations, type ANCVisit, type PregnancyRecord } from '@/lib/db';
import { DashboardShell } from '@/components/DashboardShell';
import type { RoleViewProps } from '@/components/RoleView';
import {
  ANC_MILESTONES,
  daysRemaining,
  evaluateRisks,
  formatGA,
  gestationalAge,
  progressPercent,
  trimester,
} from '@/lib/anc';

export function PatientPregnancy({ session }: RoleViewProps) {
  const router = useRouter();
  const [record, setRecord] = useState<PregnancyRecord | null>(null);
  const [visits, setVisits] = useState<ANCVisit[]>([]);

  useEffect(() => {
    const s = session;
    const patientId = dbOperations.getPatientByUserId(s.user.id)?.id;
    if (patientId) {
      const preg = dbOperations.getActivePregnancyByPatientId(patientId) ?? null;
      setRecord(preg);
      if (preg) setVisits([...dbOperations.getANCVisitsByPregnancyId(preg.id)]);
    }
  }, [session]);

  if (!record) {
    return (
      <DashboardShell role={session.user.role} userName={session.user.name} title="Pregnancy Tracker">
        <div className="max-w-md mx-auto text-center py-16">
          <div className="w-16 h-16 rounded-full bg-cyan-100 flex items-center justify-center mx-auto mb-4">
            <Baby className="w-8 h-8 text-cyan-600" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900">No pregnancy record yet</h2>
          <p className="text-sm text-slate-500 mt-2">
            Your care team will set up your pregnancy record at your booking visit. Once created,
            you&apos;ll see your due date, week-by-week progress and antenatal visit history here.
          </p>
        </div>
      </DashboardShell>
    );
  }

  const ga = gestationalAge(record.lmp);
  const tri = trimester(ga.weeks);
  const progress = progressPercent(ga.totalDays);
  const remaining = daysRemaining(ga.totalDays);
  const latest = visits[visits.length - 1];
  const risks = evaluateRisks(record, latest);

  const chartData = visits.map((v) => ({
    week: v.weeks,
    weight: v.weight || null,
    systolic: v.systolic || null,
    diastolic: v.diastolic || null,
  }));

  const eddLabel = new Date(record.edd + 'T00:00:00').toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <DashboardShell
      role={session.user.role}
      userName={session.user.name}
      title="Pregnancy Tracker"
      subtitle={`Trimester ${tri} · ${formatGA(ga)}`}
    >
      <div className="space-y-6">
        {/* Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard icon={CalendarClock} tint="cyan" label="Estimated due date" value={eddLabel} sub={`${remaining} days to go`} />
          <StatCard icon={Baby} tint="teal" label="Gestational age" value={formatGA(ga)} sub={`Trimester ${tri}`} />
          <StatCard
            icon={Activity}
            tint={latest ? 'emerald' : 'slate'}
            label="Latest visit"
            value={latest ? `${latest.systolic}/${latest.diastolic} · ${latest.weight}kg` : 'No visits yet'}
            sub={latest ? new Date(latest.date + 'T00:00:00').toLocaleDateString('en-IN') : '—'}
          />
        </div>

        {/* Progress bar */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="font-medium text-slate-700">Week {ga.weeks} of 40</span>
            <span className="text-slate-500">{progress}%</span>
          </div>
          <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-teal-600 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex justify-between text-[11px] text-slate-400 mt-1">
            <span>1st trimester</span>
            <span>2nd</span>
            <span>3rd</span>
            <span>Term</span>
          </div>
        </div>

        {/* Risk flags */}
        {risks.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <h3 className="text-sm font-semibold text-amber-800">Points to watch</h3>
            </div>
            <ul className="space-y-1">
              {risks.map((r, i) => (
                <li key={i} className="text-sm text-amber-800">
                  <span className={`font-medium ${r.level === 'critical' ? 'text-red-700' : ''}`}>{r.label}</span>
                  <span className="text-amber-700"> — {r.detail}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Milestones timeline */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Antenatal milestones</h3>
          <ol className="space-y-3">
            {ANC_MILESTONES.map((m) => {
              const done = ga.weeks >= m.week;
              return (
                <li key={m.week} className="flex items-start gap-3">
                  {done ? (
                    <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                  ) : (
                    <Circle className="w-5 h-5 text-slate-300 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <p className={`text-sm ${done ? 'text-slate-900 font-medium' : 'text-slate-500'}`}>
                      Week {m.week} · {m.label}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        {/* Charts */}
        {visits.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard title="Weight (kg)">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="week" tickLine={false} fontSize={12} label={{ value: 'week', position: 'insideBottomRight', offset: -4, fontSize: 11 }} />
                <YAxis tickLine={false} fontSize={12} width={32} />
                <Tooltip />
                <Line type="monotone" dataKey="weight" stroke="#0891b2" strokeWidth={2} dot={{ r: 3 }} connectNulls />
              </LineChart>
            </ChartCard>
            <ChartCard title="Blood pressure (mmHg)">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="week" tickLine={false} fontSize={12} />
                <YAxis tickLine={false} fontSize={12} width={32} />
                <Tooltip />
                <Line type="monotone" dataKey="systolic" stroke="#dc2626" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                <Line type="monotone" dataKey="diastolic" stroke="#d97706" strokeWidth={2} dot={{ r: 3 }} connectNulls />
              </LineChart>
            </ChartCard>
          </div>
        )}

        {/* Visit history */}
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <h3 className="text-sm font-semibold text-slate-900 px-5 pt-5 pb-3">Antenatal visits</h3>
          {visits.length === 0 ? (
            <p className="text-sm text-slate-500 px-5 pb-5">No antenatal visits recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500 border-y border-slate-100 bg-slate-50">
                    <th className="px-5 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 font-medium">Week</th>
                    <th className="px-3 py-2 font-medium">Weight</th>
                    <th className="px-3 py-2 font-medium">BP</th>
                    <th className="px-3 py-2 font-medium">Fundal ht.</th>
                    <th className="px-3 py-2 font-medium">Hb</th>
                    <th className="px-3 py-2 font-medium">FHR</th>
                  </tr>
                </thead>
                <tbody>
                  {[...visits].reverse().map((v) => (
                    <tr key={v.id} className="border-b border-slate-50 last:border-0">
                      <td className="px-5 py-2 text-slate-700">{new Date(v.date + 'T00:00:00').toLocaleDateString('en-IN')}</td>
                      <td className="px-3 py-2 text-slate-700">{v.weeks}w</td>
                      <td className="px-3 py-2 text-slate-700">{v.weight ? `${v.weight} kg` : '—'}</td>
                      <td className="px-3 py-2 text-slate-700">{v.systolic ? `${v.systolic}/${v.diastolic}` : '—'}</td>
                      <td className="px-3 py-2 text-slate-700">{v.fundalHeight ? `${v.fundalHeight} cm` : '—'}</td>
                      <td className="px-3 py-2 text-slate-700">{v.hemoglobin ? `${v.hemoglobin}` : '—'}</td>
                      <td className="px-3 py-2 text-slate-700">{v.fetalHeartRate ? `${v.fetalHeartRate}` : '—'}</td>
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

const TINTS: Record<string, string> = {
  cyan: 'bg-cyan-100 text-cyan-600',
  teal: 'bg-teal-100 text-teal-600',
  emerald: 'bg-emerald-100 text-emerald-600',
  slate: 'bg-slate-100 text-slate-500',
};

function StatCard({
  icon: Icon,
  tint,
  label,
  value,
  sub,
}: {
  icon: typeof Baby;
  tint: string;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${TINTS[tint]}`}>
        <Icon className="w-5 h-5" />
      </div>
      <p className="text-xs text-slate-500 mt-3">{label}</p>
      <p className="text-base font-semibold text-slate-900 mt-0.5">{value}</p>
      <p className="text-xs text-slate-400">{sub}</p>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactElement }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <h3 className="text-sm font-semibold text-slate-900 mb-3">{title}</h3>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
