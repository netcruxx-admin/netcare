// -----------------------------------------------------------------------------
// Newborn helpers — age math, the IAP immunization schedule, WHO weight-for-age
// percentile reference bands, and immunization status derivation.
// Pure functions / static data; no persistence.
// -----------------------------------------------------------------------------

import type { Immunization } from './db';
import { MS_PER_DAY } from './constants';
import type { ImmStatus, VaccineDose, WhoPoint } from './types';

// Re-export the newborn types (definitions live in ./types).
export type { ImmStatus, VaccineDose, WhoPoint } from './types';

const parse = (d: string) => new Date(d + 'T00:00:00');

export function addDays(dateStr: string, days: number): string {
  const d = parse(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

export function ageInDays(dob: string, on: Date = new Date()): number {
  return Math.max(0, Math.floor((on.getTime() - parse(dob).getTime()) / MS_PER_DAY));
}

export function ageInMonths(dob: string, on: Date = new Date()): number {
  return ageInDays(dob, on) / 30.4375;
}

/** Friendly age label — weeks under ~3 months, else months, else years+months. */
export function ageDisplay(dob: string, on: Date = new Date()): string {
  const days = ageInDays(dob, on);
  if (days < 90) return `${Math.floor(days / 7)} weeks`;
  const months = Math.floor(days / 30.4375);
  if (months < 24) return `${months} months`;
  const y = Math.floor(months / 12);
  const m = months % 12;
  return m ? `${y}y ${m}m` : `${y} years`;
}

// --- IAP immunization schedule (simplified, India) ---------------------------
export const IAP_SCHEDULE: VaccineDose[] = [
  { vaccine: 'BCG', ageLabel: 'At birth', ageDays: 0 },
  { vaccine: 'OPV-0', ageLabel: 'At birth', ageDays: 0 },
  { vaccine: 'Hepatitis B-1', ageLabel: 'At birth', ageDays: 0 },
  { vaccine: 'DTwP-1', ageLabel: '6 weeks', ageDays: 42 },
  { vaccine: 'IPV-1', ageLabel: '6 weeks', ageDays: 42 },
  { vaccine: 'Hib-1', ageLabel: '6 weeks', ageDays: 42 },
  { vaccine: 'Rotavirus-1', ageLabel: '6 weeks', ageDays: 42 },
  { vaccine: 'PCV-1', ageLabel: '6 weeks', ageDays: 42 },
  { vaccine: 'Hepatitis B-2', ageLabel: '6 weeks', ageDays: 42 },
  { vaccine: 'DTwP-2', ageLabel: '10 weeks', ageDays: 70 },
  { vaccine: 'IPV-2', ageLabel: '10 weeks', ageDays: 70 },
  { vaccine: 'Hib-2', ageLabel: '10 weeks', ageDays: 70 },
  { vaccine: 'Rotavirus-2', ageLabel: '10 weeks', ageDays: 70 },
  { vaccine: 'PCV-2', ageLabel: '10 weeks', ageDays: 70 },
  { vaccine: 'DTwP-3', ageLabel: '14 weeks', ageDays: 98 },
  { vaccine: 'IPV-3', ageLabel: '14 weeks', ageDays: 98 },
  { vaccine: 'Hib-3', ageLabel: '14 weeks', ageDays: 98 },
  { vaccine: 'Rotavirus-3', ageLabel: '14 weeks', ageDays: 98 },
  { vaccine: 'PCV-3', ageLabel: '14 weeks', ageDays: 98 },
  { vaccine: 'Hepatitis B-3', ageLabel: '6 months', ageDays: 180 },
  { vaccine: 'OPV-1', ageLabel: '6 months', ageDays: 180 },
  { vaccine: 'MMR-1', ageLabel: '9 months', ageDays: 270 },
  { vaccine: 'Typhoid Conjugate', ageLabel: '9 months', ageDays: 270 },
  { vaccine: 'Hepatitis A-1', ageLabel: '12 months', ageDays: 365 },
  { vaccine: 'PCV Booster', ageLabel: '12 months', ageDays: 365 },
  { vaccine: 'MMR-2', ageLabel: '15 months', ageDays: 456 },
  { vaccine: 'Varicella-1', ageLabel: '15 months', ageDays: 456 },
  { vaccine: 'DTwP Booster-1', ageLabel: '18 months', ageDays: 548 },
  { vaccine: 'IPV Booster', ageLabel: '18 months', ageDays: 548 },
  { vaccine: 'Hib Booster', ageLabel: '18 months', ageDays: 548 },
];

/** Schedule entries with an actual due date computed from the baby's DOB. */
export function scheduleForDob(dob: string): { vaccine: string; ageLabel: string; dueDate: string }[] {
  return IAP_SCHEDULE.map((v) => ({ vaccine: v.vaccine, ageLabel: v.ageLabel, dueDate: addDays(dob, v.ageDays) }));
}

/** Derives display status from a stored immunization + today's date. */
export function immStatus(imm: Immunization, today: Date = new Date()): ImmStatus {
  if (imm.status === 'given') return 'given';
  const diffDays = Math.floor((parse(imm.dueDate).getTime() - today.getTime()) / MS_PER_DAY);
  if (diffDays < 0) return 'overdue';
  if (diffDays <= 14) return 'due';
  return 'upcoming';
}

// --- WHO weight-for-age reference (kg) — 3rd / 50th / 97th percentiles --------
// Approximate WHO Child Growth Standards values for charting percentile bands.
const WHO_GIRLS: WhoPoint[] = [
  { month: 0, p3: 2.4, p50: 3.2, p97: 4.2 },
  { month: 1, p3: 3.2, p50: 4.2, p97: 5.5 },
  { month: 2, p3: 4.0, p50: 5.1, p97: 6.6 },
  { month: 3, p3: 4.6, p50: 5.8, p97: 7.5 },
  { month: 4, p3: 5.1, p50: 6.4, p97: 8.2 },
  { month: 5, p3: 5.5, p50: 6.9, p97: 8.8 },
  { month: 6, p3: 5.8, p50: 7.3, p97: 9.3 },
  { month: 7, p3: 6.1, p50: 7.6, p97: 9.8 },
  { month: 8, p3: 6.3, p50: 7.9, p97: 10.2 },
  { month: 9, p3: 6.6, p50: 8.2, p97: 10.5 },
  { month: 10, p3: 6.8, p50: 8.5, p97: 10.9 },
  { month: 11, p3: 7.0, p50: 8.7, p97: 11.2 },
  { month: 12, p3: 7.1, p50: 8.9, p97: 11.5 },
  { month: 15, p3: 7.6, p50: 9.6, p97: 12.4 },
  { month: 18, p3: 8.1, p50: 10.2, p97: 13.2 },
  { month: 21, p3: 8.6, p50: 10.9, p97: 14.0 },
  { month: 24, p3: 9.0, p50: 11.5, p97: 14.8 },
];

const WHO_BOYS: WhoPoint[] = [
  { month: 0, p3: 2.5, p50: 3.3, p97: 4.4 },
  { month: 1, p3: 3.4, p50: 4.5, p97: 5.8 },
  { month: 2, p3: 4.3, p50: 5.6, p97: 7.1 },
  { month: 3, p3: 5.0, p50: 6.4, p97: 8.0 },
  { month: 4, p3: 5.6, p50: 7.0, p97: 8.7 },
  { month: 5, p3: 6.0, p50: 7.5, p97: 9.3 },
  { month: 6, p3: 6.4, p50: 7.9, p97: 9.8 },
  { month: 7, p3: 6.7, p50: 8.3, p97: 10.3 },
  { month: 8, p3: 6.9, p50: 8.6, p97: 10.7 },
  { month: 9, p3: 7.1, p50: 8.9, p97: 11.0 },
  { month: 10, p3: 7.4, p50: 9.2, p97: 11.4 },
  { month: 11, p3: 7.6, p50: 9.4, p97: 11.7 },
  { month: 12, p3: 7.7, p50: 9.6, p97: 12.0 },
  { month: 15, p3: 8.3, p50: 10.3, p97: 12.8 },
  { month: 18, p3: 8.8, p50: 10.9, p97: 13.7 },
  { month: 21, p3: 9.2, p50: 11.5, p97: 14.5 },
  { month: 24, p3: 9.7, p50: 12.2, p97: 15.3 },
];

export function whoWeightForAge(sex: 'male' | 'female'): WhoPoint[] {
  return sex === 'male' ? WHO_BOYS : WHO_GIRLS;
}
