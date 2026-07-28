// -----------------------------------------------------------------------------
// Antenatal care (ANC) calculations — pure functions, no persistence.
// Used by the maternity Pregnancy Tracker.
// -----------------------------------------------------------------------------

import type { ANCVisit, PregnancyRecord } from './db';
import { MS_PER_DAY } from './constants';
import type { GestationalAge, Milestone, RiskFlag } from './types';

// Re-export the ANC types (definitions live in ./types).
export type { GestationalAge, Milestone, RiskFlag } from './types';

/** A full-term pregnancy is 280 days (40 weeks) from the LMP (Naegele's rule). */
export const GESTATION_DAYS = 280;

function parseDate(d: string): Date {
  return new Date(d + 'T00:00:00');
}

/** Estimated due date = LMP + 280 days. */
export function eddFromLmp(lmp: string): string {
  const d = parseDate(lmp);
  d.setDate(d.getDate() + GESTATION_DAYS);
  return d.toISOString().split('T')[0];
}

/** Gestational age at `on` (defaults to today), measured from the LMP. */
export function gestationalAge(lmp: string, on: Date = new Date()): GestationalAge {
  const start = parseDate(lmp).getTime();
  const diff = Math.floor((on.getTime() - start) / MS_PER_DAY);
  const totalDays = Math.max(0, diff);
  return { weeks: Math.floor(totalDays / 7), days: totalDays % 7, totalDays };
}

export function trimester(weeks: number): 1 | 2 | 3 {
  if (weeks < 14) return 1;
  if (weeks < 28) return 2;
  return 3;
}

export function progressPercent(totalDays: number): number {
  return Math.min(100, Math.max(0, Math.round((totalDays / GESTATION_DAYS) * 100)));
}

export function daysRemaining(totalDays: number): number {
  return Math.max(0, GESTATION_DAYS - totalDays);
}

export function formatGA(ga: GestationalAge): string {
  return `${ga.weeks}w ${ga.days}d`;
}

// --- Recommended ANC milestones (India / WHO-aligned schedule) ---------------
export const ANC_MILESTONES: Milestone[] = [
  { week: 8, label: 'Booking visit & dating scan' },
  { week: 12, label: 'NT scan / 1st-trimester screening' },
  { week: 20, label: 'Anomaly scan (Level II)' },
  { week: 26, label: 'Glucose screening (OGTT)' },
  { week: 32, label: 'Growth scan & Tdap' },
  { week: 36, label: 'Group B strep, presentation check' },
  { week: 40, label: 'Term — delivery' },
];

// --- Risk evaluation ---------------------------------------------------------
/** Derives clinical risk flags from the pregnancy record and its latest visit. */
export function evaluateRisks(record: PregnancyRecord, latest?: ANCVisit): RiskFlag[] {
  const flags: RiskFlag[] = [];

  if (latest) {
    if (latest.systolic >= 140 || latest.diastolic >= 90) {
      flags.push({
        level: 'critical',
        label: 'High blood pressure',
        detail: `${latest.systolic}/${latest.diastolic} mmHg — screen for pre-eclampsia`,
      });
    }
    if (latest.hemoglobin > 0 && latest.hemoglobin < 11) {
      flags.push({
        level: latest.hemoglobin < 9 ? 'critical' : 'warning',
        label: latest.hemoglobin < 9 ? 'Severe anemia' : 'Anemia',
        detail: `Hb ${latest.hemoglobin} g/dL (target ≥ 11)`,
      });
    }
    if (latest.fetalHeartRate > 0 && (latest.fetalHeartRate < 110 || latest.fetalHeartRate > 160)) {
      flags.push({
        level: 'warning',
        label: 'Abnormal fetal heart rate',
        detail: `${latest.fetalHeartRate} bpm (normal 110–160)`,
      });
    }
  }

  for (const rf of record.riskFactors) {
    flags.push({ level: 'warning', label: rf, detail: 'Recorded risk factor' });
  }

  return flags;
}
