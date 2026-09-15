'use client';

import { useListAppointmentsQuery } from '@/store/api';

/**
 * Whether this patient already has a live (non-cancelled) appointment in this
 * department on this date — the same one-booking-per-department-per-day rule
 * the backend refuses at create time. Lets a booking form warn before a
 * doomed submit rather than only after.
 *
 * `excludeAppointmentId` is for rescheduling: the appointment being moved is
 * itself a live booking in that department, so without excluding it a
 * reschedule that keeps the same date (or the same department) would always
 * flag as a conflict with itself.
 */
export function useDepartmentBookingConflict(
  patientId: string,
  departmentId: string,
  date: string,
  excludeAppointmentId?: string,
): boolean {
  const ready = Boolean(patientId && departmentId && date);
  const { data: appointments = [] } = useListAppointmentsQuery(
    ready ? { patientId, departmentId, date } : undefined,
    { skip: !ready },
  );
  return ready && appointments.some((a) => a.status !== 'cancelled' && a.id !== excludeAppointmentId);
}
