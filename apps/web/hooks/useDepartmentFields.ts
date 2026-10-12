'use client';

import { useListDepartmentsQuery } from '@/store/api';

/**
 * What a visit in a department records: the vitals and clinical-note fields,
 * as lists of catalog keys (see apps/api/app/clinical_fields.py).
 *
 * `undefined` means "not known yet" -- the department list is still loading, or
 * the id is not in it -- and forms read that as "show everything", so a screen
 * never hides a field it cannot yet justify hiding. The server refuses an
 * unrecorded field regardless, so the fallback cannot save bad data.
 */
export function useDepartmentFields(departmentId: string | undefined | null): {
  vitals: string[] | undefined;
  notes: string[] | undefined;
} {
  const { data: departments } = useListDepartmentsQuery(undefined, { skip: !departmentId });
  const department = departments?.find((d) => d.id === departmentId);
  return { vitals: department?.vitalsFields, notes: department?.noteFields };
}
