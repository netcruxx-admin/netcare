'use client';

import { useMemo } from 'react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { Baby as BabyIcon, Syringe, AlertTriangle, CheckCircle2, Clock, CalendarDays } from 'lucide-react';
import type { Baby, Immunization } from '@/lib/types';
import {
  useGetPatientByUserQuery,
  useListBabiesQuery,
  useListGrowthQuery,
  useListImmunizationsQuery,
} from '@/store/api';
import { DashboardShell } from '@/components/DashboardShell';
import type { RoleViewProps } from '@/components/RoleView';
import { ageDisplay, ageInMonths, immStatus, whoWeightForAge, type ImmStatus } from '@/lib/baby';
import { Spinner } from '@/components/ui/spinner';

const STATUS_STYLE: Record<ImmStatus, string> = {
  given: 'bg-green-100 text-green-700',
  overdue: 'bg-red-100 text-red-700',
  due: 'bg-amber-100 text-amber-700',
  upcoming: 'bg-slate-100 text-slate-500',
};
const STATUS_LABEL: Record<ImmStatus, string> = { given: 'Given', overdue: 'Overdue', due: 'Due now', upcoming: 'Upcoming' };

export function PatientBaby({ session }: RoleViewProps) {
  const { data: patient, isLoading: loadingPatient } = useGetPatientByUserQuery(session.user.id);
  const { data: babies = [], isLoading: loadingBabies } = useListBabiesQuery(
    { motherPatientId: patient?.id },
    { skip: !patient },
  );
  const baby: Baby | null = babies[0] ?? null;

  const { data: imms = [] } = useListImmunizationsQuery(baby?.id ?? '', { skip: !baby });
  const { data: measurements = [] } = useListGrowthQuery(baby?.id ?? '', { skip: !baby });

  // Growth is charted against the baby's age at each measurement.
  const growth = useMemo(
    () =>
      baby
        ? measurements.map((m) => ({
            month: Math.round(ageInMonths(baby.dateOfBirth, new Date(m.date + 'T00:00:00')) * 10) / 10,
            weight: m.weight,
          }))
        : [],
    [baby, measurements],
  );

  if (loadingPatient || loadingBabies || !baby) {
    return (
      <DashboardShell
        role={session.user.role}
        userName={session.user.name}
        title="My Baby"
        loading={loadingPatient || loadingBabies}
      >
        <div className="max-w-md mx-auto text-center py-16">
          <div className="w-16 h-16 rounded-full bg-cyan-100 flex items-center justify-center mx-auto mb-4">
            <BabyIcon className="w-8 h-8 text-cyan-600" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900">No newborn record yet</h2>
          <p className="text-sm text-slate-500 mt-2">
            After delivery, your care team registers your baby here — you&apos;ll then see growth charts and the
            immunisation schedule with reminders.
          </p>
        </div>
      </DashboardShell>
    );
  }

  const who = whoWeightForAge(baby.sex);
  const reminders = imms.filter((i) => ['overdue', 'due'].includes(immStatus(i)));

  // Group immunisations by age label for the schedule view.
  const groups = imms.reduce<Record<string, Immunization[]>>((acc, i) => {
    (acc[i.ageLabel] ??= []).push(i);
    return acc;
  }, {});

  return (
    <DashboardShell role={session.user.role} userName={session.user.name} title="My Baby" subtitle={`${baby.name} · ${ageDisplay(baby.dateOfBirth)}`}>
      <div className="space-y-6">
        {/* Baby summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Age" value={ageDisplay(baby.dateOfBirth)} />
          <Stat label="Sex" value={baby.sex === 'male' ? 'Boy' : 'Girl'} />
          <Stat label="Birth weight" value={`${baby.birthWeight} kg`} />
          <Stat label="Born" value={new Date(baby.dateOfBirth + 'T00:00:00').toLocaleDateString('en-IN')} />
        </div>

        {/* Reminders */}
        {reminders.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <h3 className="text-sm font-semibold text-amber-800">Vaccination reminders</h3>
            </div>
            <ul className="space-y-1">
              {reminders.map((i) => (
                <li key={i.id} className="text-sm text-amber-800 flex items-center gap-2">
                  <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${STATUS_STYLE[immStatus(i)]}`}>{STATUS_LABEL[immStatus(i)]}</span>
                  <span className="font-medium">{i.vaccine}</span>
                  <span className="text-amber-700">· due {i.dueDate}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Growth chart */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-slate-900 mb-1">Weight-for-age</h3>
          <p className="text-xs text-slate-500 mb-3">Baby&apos;s weight against WHO percentile bands (3rd / 50th / 97th)</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart margin={{ top: 5, right: 10, bottom: 5, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" type="number" domain={[0, 24]} tickCount={9} fontSize={12} tickLine={false}
                  label={{ value: 'age (months)', position: 'insideBottom', offset: -2, fontSize: 11 }} />
                <YAxis fontSize={12} tickLine={false} width={40} label={{ value: 'kg', angle: -90, position: 'insideLeft', fontSize: 11 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line data={who} dataKey="p97" name="97th" stroke="#cbd5e1" strokeDasharray="4 4" dot={false} strokeWidth={1.5} />
                <Line data={who} dataKey="p50" name="50th (median)" stroke="#94a3b8" dot={false} strokeWidth={1.5} />
                <Line data={who} dataKey="p3" name="3rd" stroke="#cbd5e1" strokeDasharray="4 4" dot={false} strokeWidth={1.5} />
                <Line data={growth} dataKey="weight" name={baby.name} stroke="#0891b2" strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Immunisation schedule */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-2 mb-4">
            <Syringe className="w-4 h-4 text-cyan-600" />
            <h3 className="text-sm font-semibold text-slate-900">Immunisation schedule</h3>
          </div>
          <div className="space-y-4">
            {Object.entries(groups).map(([label, list]) => (
              <div key={label}>
                <p className="text-xs font-semibold text-slate-500 mb-1.5 flex items-center gap-1">
                  <CalendarDays className="w-3.5 h-3.5" /> {label}
                </p>
                <div className="flex flex-wrap gap-2">
                  {list.map((i) => {
                    const st = immStatus(i);
                    return (
                      <span key={i.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm border border-slate-200">
                        {st === 'given' ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : <Clock className="w-3.5 h-3.5 text-slate-400" />}
                        <span className="text-slate-700">{i.vaccine}</span>
                        <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${STATUS_STYLE[st]}`}>{STATUS_LABEL[st]}</span>
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-sm font-semibold text-slate-900 mt-0.5">{value}</p>
    </div>
  );
}
