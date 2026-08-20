import { useMemo } from 'react';
import { useGetHospitalOperationalQuery } from '@/store/api';
import { breakSlotsFromRange } from '@/lib/schedule';

/**
 * Returns the Set of slot labels that fall within this hospital's lunch break.
 *
 * Fetches GET /hospitals/current/operational (public, no auth required).
 * Falls back to the default 12:00–14:00 window while loading or on error.
 *
 * @param slots - The full array of slot labels to filter (e.g. SLOTS or GRID_SLOTS).
 */
export function useBreakSlots(slots: string[]): Set<string> {
  const { data } = useGetHospitalOperationalQuery();
  const start = data?.lunchBreakStart ?? '12:00';
  const end = data?.lunchBreakEnd ?? '14:00';
  // slots is a module-level constant in every caller, so this memo only
  // reruns when the hospital's operational settings change.
  return useMemo(() => breakSlotsFromRange(start, end, slots), [start, end, slots]);
}
