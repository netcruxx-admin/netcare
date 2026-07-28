/**
 * Mock "nursing council registration verification" service.
 *
 * Same idea as the doctor registry, for nurses: pass a nursing council
 * registration number and get back the council-verified profile — or `null`.
 *
 * There is no free, browser-callable public API for the Indian Nursing Council
 * / state nursing council registers, so this looks the number up in a small
 * in-memory registry after a simulated delay. Swap the body of
 * `lookupNurseRegistration` for a real backend call to go live; the return type
 * stays the same.
 */

import type { NurseRegistryRecord } from './types';

// Re-export the registry record type (definition lives in ./types).
export type { NurseRegistryRecord } from './types';

// Sample registered nurses. Numbers are matched case-insensitively.
const REGISTRY: NurseRegistryRecord[] = [
  {
    registrationNumber: 'INC-2016-118822',
    name: 'Anita Rao',
    qualification: 'B.Sc Nursing',
    nursingCouncil: 'Indian Nursing Council',
    registrationYear: '2016',
    status: 'active',
  },
  {
    registrationNumber: 'MNC-2014-052210',
    name: 'Fatima Sheikh',
    qualification: 'GNM (General Nursing & Midwifery)',
    nursingCouncil: 'Maharashtra Nursing Council',
    registrationYear: '2014',
    status: 'active',
  },
  {
    registrationNumber: 'KNC-2018-073344',
    name: 'Lakshmi Menon',
    qualification: 'B.Sc Nursing',
    nursingCouncil: 'Karnataka Nursing Council',
    registrationYear: '2018',
    status: 'active',
  },
  {
    registrationNumber: 'DNC-2012-009911',
    name: 'Sunita Yadav',
    qualification: 'M.Sc Nursing (Obstetrics & Gynaecology)',
    nursingCouncil: 'Delhi Nursing Council',
    registrationYear: '2012',
    status: 'active',
  },
];

const normalize = (value: string) => value.trim().toUpperCase().replace(/\s+/g, '');

/**
 * Look up a nurse by registration number.
 * Resolves to the record, or `null` when the number isn't on the register.
 */
export async function lookupNurseRegistration(registrationNumber: string): Promise<NurseRegistryRecord | null> {
  const query = normalize(registrationNumber);

  await new Promise((resolve) => setTimeout(resolve, 900));

  if (!query) return null;
  return REGISTRY.find((r) => normalize(r.registrationNumber) === query) ?? null;
}

/** Registration numbers a demo user can try. */
export const SAMPLE_NURSE_REGISTRATION_NUMBERS = REGISTRY.map((r) => r.registrationNumber);
