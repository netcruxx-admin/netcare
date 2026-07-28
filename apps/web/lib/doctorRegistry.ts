/**
 * Mock "medical registration verification" service.
 *
 * Mirrors the shape of a real KYC provider (e.g. Surepass / IDfy "Doctor
 * Registration Verification"): you pass a registration number, and it resolves
 * to the practitioner's council-verified profile — or `null` if not found.
 *
 * There is no free, browser-callable public API for this (the NMC / Indian
 * Medical Register offers only a manual search page, and third-party providers
 * are paid + backend-only). So this looks the number up in a small in-memory
 * registry after a simulated network delay.
 *
 * To go live later, swap the body of `lookupDoctorRegistration` for a call to
 * your backend endpoint — the return type stays the same, so nothing else in
 * the app changes.
 */

import type { DoctorRegistryRecord } from './types';

// Re-export the registry record type (definition lives in ./types).
export type { DoctorRegistryRecord } from './types';

// Sample verified practitioners. Registration numbers are case-insensitive.
const REGISTRY: DoctorRegistryRecord[] = [
  {
    registrationNumber: 'MH-2012-045678',
    name: 'Dr. Ananya Deshpande',
    qualification: 'MBBS, MD (Obstetrics & Gynecology)',
    specialization: 'Obstetrics & Gynecology',
    medicalCouncil: 'Maharashtra Medical Council',
    registrationYear: '2012',
    status: 'active',
  },
  {
    registrationNumber: 'DL-2016-112233',
    name: 'Dr. Rohan Malhotra',
    qualification: 'MBBS, DNB (Neonatology)',
    specialization: 'Neonatology',
    medicalCouncil: 'Delhi Medical Council',
    registrationYear: '2016',
    status: 'active',
  },
  {
    registrationNumber: 'KA-2009-078451',
    name: 'Dr. Meera Iyer',
    qualification: 'MBBS, MD (Pediatrics)',
    specialization: 'Pediatric Care',
    medicalCouncil: 'Karnataka Medical Council',
    registrationYear: '2009',
    status: 'active',
  },
  {
    registrationNumber: 'TN-2018-090342',
    name: 'Dr. Karthik Subramanian',
    qualification: 'MBBS, DGO',
    specialization: 'Maternal Wellness',
    medicalCouncil: 'Tamil Nadu Medical Council',
    registrationYear: '2018',
    status: 'active',
  },
  {
    registrationNumber: 'NMC-2020-556677',
    name: 'Dr. Priya Nair',
    qualification: 'MBBS, MS (OBG)',
    specialization: 'Labor & Delivery',
    medicalCouncil: 'National Medical Commission (NMC)',
    registrationYear: '2020',
    status: 'active',
  },
];

const normalize = (value: string) => value.trim().toUpperCase().replace(/\s+/g, '');

/**
 * Look up a practitioner by registration/license number.
 * Resolves to the record, or `null` when the number isn't on the register.
 */
export async function lookupDoctorRegistration(
  registrationNumber: string
): Promise<DoctorRegistryRecord | null> {
  const query = normalize(registrationNumber);

  // Simulate network latency so the UI's loading state is visible.
  await new Promise((resolve) => setTimeout(resolve, 900));

  if (!query) return null;
  return REGISTRY.find((r) => normalize(r.registrationNumber) === query) ?? null;
}

/** Registration numbers a demo user can try. */
export const SAMPLE_REGISTRATION_NUMBERS = REGISTRY.map((r) => r.registrationNumber);
