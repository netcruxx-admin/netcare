'use client';

import { useListAppointmentsQuery } from '@/store/api';

/**
 * Whether this patient already has a live (non-cancelled) appointment in this
 * department on this date — the same one-booking-per-department-per-day rule
 * the backend refuses at create time. Lets a booking form warn before a
 * doomed submit rather than only after.
 */
export function useDepartmentBookingConflict(
  patientId: string,
  departmentId: string,
  date: string,
): boolean {
  const ready = Boolean(patientId && departmentId && date);
  const { data: appointments = [] } = useListAppointmentsQuery(
    ready ? { patientId, departmentId, date } : undefined,
    { skip: !ready },
  );
  return ready && appointments.some((a) => a.status !== 'cancelled');
}
