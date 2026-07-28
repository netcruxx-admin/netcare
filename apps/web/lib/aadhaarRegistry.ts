/**
 * Mock "Aadhaar (UIDAI) e-KYC" service.
 *
 * Mirrors the shape of a real Aadhaar KYC provider: you pass a 12-digit Aadhaar
 * number and it resolves to the demographic record UIDAI holds — or `null` if
 * the number isn't recognised.
 *
 * There is no free, browser-callable public Aadhaar API (real access is via
 * paid, backend-only KYC providers with UIDAI authorisation). So this looks the
 * number up in a small in-memory registry after a simulated network delay.
 *
 * To go live later, swap the body of `lookupAadhaar` for a call to your backend
 * endpoint — the return type stays the same, so nothing else in the app changes.
 */

import type { AadhaarRecord } from './types';

// Re-export the registry record type (definition lives in ./types).
export type { AadhaarRecord } from './types';

// Sample residents. Aadhaar numbers are matched ignoring spaces/hyphens.
const REGISTRY: AadhaarRecord[] = [
  {
    aadhaarNumber: '234567890123',
    name: 'Meera Sharma',
    dateOfBirth: '1994-03-12',
    gender: 'Female',
    phone: '+91 90000 11111',
    address: 'Indiranagar, Bengaluru, Karnataka',
  },
  {
    aadhaarNumber: '345678901234',
    name: 'Priya Verma',
    dateOfBirth: '1990-07-25',
    gender: 'Female',
    phone: '+91 90000 22222',
    address: 'Kothrud, Pune, Maharashtra',
  },
  {
    aadhaarNumber: '456789012345',
    name: 'Anjali Nair',
    dateOfBirth: '1988-11-05',
    gender: 'Female',
    phone: '+91 90000 33333',
    address: 'Panampilly Nagar, Kochi, Kerala',
  },
  {
    aadhaarNumber: '567890123456',
    name: 'Rahul Gupta',
    dateOfBirth: '1992-01-18',
    gender: 'Male',
    phone: '+91 90000 44444',
    address: 'Dwarka, New Delhi',
  },
];

/** Strip everything except digits so "2345 6789 0123" == "234567890123". */
const normalize = (value: string) => value.replace(/\D/g, '');

/**
 * Look up a resident by Aadhaar number.
 * Resolves to the record, or `null` when the (12-digit) number isn't found.
 */
export async function lookupAadhaar(aadhaarNumber: string): Promise<AadhaarRecord | null> {
  const query = normalize(aadhaarNumber);

  // Simulate network latency so the UI's loading state is visible.
  await new Promise((resolve) => setTimeout(resolve, 900));

  if (query.length !== 12) return null;
  return REGISTRY.find((r) => normalize(r.aadhaarNumber) === query) ?? null;
}

/** Aadhaar numbers a demo user can try (formatted in groups of four). */
export const SAMPLE_AADHAAR_NUMBERS = REGISTRY.map((r) => r.aadhaarNumber.replace(/(\d{4})(?=\d)/g, '$1 '));
