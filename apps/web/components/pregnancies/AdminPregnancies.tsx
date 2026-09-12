'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { Baby, AlertTriangle, CalendarClock, Users } from 'lucide-react';
import { useListPregnanciesPagedQuery } from '@/store/api';
import { DashboardShell } from '@/components/DashboardShell';
import type { RoleViewProps } from '@/components/RoleView';
import { Spinner } from '@/components/ui/spinner';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { formatGA, gestationalAge, trimester } from '@/lib/anc';

/**
 * The admin-facing census the Pregnancies module never had: how many active
 * pregnancies, how many due this month, how many flagged as high-risk — the
 * questions an admin actually asks, as opposed to the doctor/nurse card grid
 * built for per-patient antenatal work.
 *
 * Reads the first 200 active records (the backend's page ceiling) rather than
 * every page — plenty for a single hospital's live census; a hospital that
 * genuinely exceeds it needs a real aggregate endpoint, not a bigger page.
 */
export function AdminPregnancies({ session }: RoleViewProps) {
  const { data: page, isLoading } = useListPregnanciesPagedQuery({
    status: 'active',
    limit: 200,
    offset: 0,
  });
  const records = page?.items ?? [];
  const total = page?.total ?? 0;

  const stats = useMemo(() => {
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    let dueThisMonth = 0;
    let highRisk = 0;
    const byTrimester = { 1: 0, 2: 0, 3: 0 } as Record<1 | 2 | 3, number>;
    for (const r of records) {
      if (r.edd.startsWith(thisMonth)) dueThisMonth += 1;
      if (r.riskFactors.length > 0) highRisk += 1;
      byTrimester[trimester(gestationalAge(r.lmp).weeks)] += 1;
    }
    return { dueThisMonth, highRisk, byTrimester };
  }, [records]);

  return (
    <DashboardShell
      role={session.user.role}
      userName={session.user.name}
      title="Pregnancies"
      subtitle="Antenatal census across the hospital"
    >
      {isLoading ? (
        <Spinner variant="block" />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatTile icon={Users} tint="cyan" label="Active pregnancies" value={total} />
            <StatTile icon={CalendarClock} tint="teal" label="Due this month" value={stats.dueThisMonth} />
            <StatTile icon={AlertTriangle} tint="amber" label="Flagged high-risk" value={stats.highRisk} />
            <StatTile
              icon={Baby}
              tint="slate"
              label="By trimester"
              value={`${stats.byTrimester[1]} · ${stats.byTrimester[2]} · ${stats.byTrimester[3]}`}
              sub="1st · 2nd · 3rd"
            />
          </div>

          {total > records.length && (
            <p className="text-xs text-slate-400">
              Showing the first {records.length} of {total} active records.
            </p>
          )}

          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-900">Active pregnancies ({records.length})</h3>
            </div>
            {records.length === 0 ? (
              <div className="text-center py-16 text-slate-500">
                <Baby className="w-10 h-10 mx-auto mb-3 text-slate-300" />
                <p className="text-sm">No active pregnancy records yet.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="text-left text-xs text-slate-500 border-b border-slate-100 bg-slate-50">
                      <TableHead className="px-6 py-2.5 font-medium">Patient</TableHead>
                      <TableHead className="px-4 py-2.5 font-medium">Gestational age</TableHead>
                      <TableHead className="px-4 py-2.5 font-medium">EDD</TableHead>
                      <TableHead className="px-4 py-2.5 font-medium">G/P</TableHead>
                      <TableHead className="px-4 py-2.5 font-medium">Flags</TableHead>
                      <TableHead className="px-6 py-2.5 font-medium text-right">Antenatal visits</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...records]
                      .sort((a, b) => a.edd.localeCompare(b.edd))
                      .map((r) => {
                        const ga = gestationalAge(r.lmp);
                        return (
                          <TableRow key={r.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                            <TableCell className="px-6 py-3 font-medium text-slate-900 whitespace-normal">{r.patientName || r.patientId}</TableCell>
                            <TableCell className="px-4 py-3 text-slate-600 whitespace-normal">{formatGA(ga)} · Tri {trimester(ga.weeks)}</TableCell>
                            <TableCell className="px-4 py-3 text-slate-600">{new Date(r.edd + 'T00:00:00').toLocaleDateString('en-IN')}</TableCell>
                            <TableCell className="px-4 py-3 text-slate-600 whitespace-normal">G{r.gravida}P{r.para}</TableCell>
                            <TableCell className="px-4 py-3 whitespace-normal">
                              {r.riskFactors.length > 0 ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
                                  <AlertTriangle className="w-3 h-3" /> {r.riskFactors.length}
                                </span>
                              ) : (
                                <span className="text-slate-300">—</span>
                              )}
                            </TableCell>
                            <TableCell className="px-6 py-3 text-right text-slate-600 whitespace-normal">{r.visitCount ?? 0}</TableCell>
                          </TableRow>
                        );
                      })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          <p className="text-xs text-slate-400">
            Full record management (new pregnancies, antenatal visits) happens from a doctor or
            nurse account. <Link href="/dashboard/patients" className="text-cyan-600 hover:text-cyan-700 font-medium">Go to Patients →</Link>
          </p>
        </div>
      )}
    </DashboardShell>
  );
}

const TINTS: Record<string, string> = {
  cyan: 'bg-cyan-100 text-cyan-600',
  teal: 'bg-teal-100 text-teal-600',
  amber: 'bg-amber-100 text-amber-600',
  slate: 'bg-slate-100 text-slate-500',
};

function StatTile({
  icon: Icon,
  tint,
  label,
  value,
  sub,
}: {
  icon: typeof Baby;
  tint: string;
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${TINTS[tint]}`}>
        <Icon className="w-5 h-5" />
      </div>
      <p className="text-2xl font-bold text-slate-900 mt-3 leading-tight">{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
      {sub && <p className="text-[10px] text-slate-400">{sub}</p>}
    </div>
  );
}
