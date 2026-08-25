'use client';

import { useMemo } from 'react';
import { doctorRole, patientRole, type PatientContext } from '@/lib/roles';
import {
  useGetDoctorByUserQuery,
  useListAppointmentsQuery,
  useListBabiesQuery,
  useListDepartmentsQuery,
  useListDoctorsQuery,
  useListPregnanciesQuery,
} from '@/store/api';

/** No care context — a nurse, an admin, or a session that isn't loaded yet. */
const NO_PATIENT_CONTEXT: PatientContext = {
  specializations: [],
  hasPregnancy: false,
  hasBaby: false,
};

export interface CareContext {
  /** The signed-in doctor's free-text specialization ('' for other roles). */
  specialization: string;
  /** The name of the signed-in doctor's department ('' for other roles). */
  department: string;
  /** The signed-in patient's care context (all-empty for other roles). */
  patientContext: PatientContext;
}

/**
 * What the signed-in user is clinically *for* — the input the sidebar needs to
 * decide whether a specialty screen applies to them.
 *
 * This exists because the answer is per-role and comes from different tables. A
 * doctor's is their own doctor row; a patient's is derived from who is treating
 * them plus whether any maternity record already exists. Neither is on the
 * session, so the shell has to ask for it.
 *
 * Every query is skipped for the roles and modules it doesn't apply to, so a
 * nurse at a hospital without ANC issues none of them. That matters beyond
 * speed: a patient at a hospital without the `anc` module does not hold
 * `pregnancies.read` at all, and asking anyway would be a guaranteed 403 on
 * every page load.
 */
export function useCareContext(options: {
  role: string;
  userId?: string;
  /** The patient row the caller *is*, when they are a patient. */
  patientId?: string;
  /** Whether the hospital has the antenatal module. Maternity lookups are
   *  pointless — and unauthorized — without it. */
  ancEnabled: boolean;
}): CareContext {
  const { role, userId, patientId, ancEnabled } = options;

  const isDoctor = role === doctorRole;
  const isPatient = role === patientRole;

  // --- Doctor: their own record, and the department it points at ------------
  const { data: doctor } = useGetDoctorByUserQuery(userId ?? '', {
    skip: !isDoctor || !userId,
  });
  const { data: departments = [] } = useListDepartmentsQuery(undefined, {
    skip: !isDoctor || !doctor?.departmentId,
  });

  // --- Patient: who treats them, and what records they already have ---------
  const { data: appointments = [] } = useListAppointmentsQuery(
    { patientId: patientId ?? '' },
    { skip: !isPatient || !patientId },
  );
  const { data: allDoctors = [] } = useListDoctorsQuery(undefined, {
    skip: !isPatient || appointments.length === 0,
  });
  const { data: patientDepartments = [] } = useListDepartmentsQuery(undefined, {
    skip: !isPatient || appointments.length === 0,
  });
  const { data: pregnancies = [] } = useListPregnanciesQuery(
    { patientId: patientId ?? '' },
    { skip: !isPatient || !patientId || !ancEnabled },
  );
  const { data: babies = [] } = useListBabiesQuery(
    { motherPatientId: patientId ?? '' },
    { skip: !isPatient || !patientId || !ancEnabled },
  );

  const department = useMemo(
    () => departments.find((d) => d.id === doctor?.departmentId)?.name ?? '',
    [departments, doctor?.departmentId],
  );

  const patientContext = useMemo<PatientContext>(() => {
    if (!isPatient) return NO_PATIENT_CONTEXT;

    const departmentName = new Map(patientDepartments.map((d) => [d.id, d.name]));
    const doctorById = new Map(allDoctors.map((d) => [d.id, d]));

    // Both the specialization and the department the appointment was filed
    // into, because either may be the one that names the field of care.
    const specializations = new Set<string>();
    for (const appointment of appointments) {
      const treating = doctorById.get(appointment.doctorId);
      if (treating?.specialization) specializations.add(treating.specialization.toLowerCase());
      const name = departmentName.get(appointment.departmentId);
      if (name) specializations.add(name.toLowerCase());
    }

    return {
      specializations: [...specializations],
      hasPregnancy: pregnancies.length > 0,
      hasBaby: babies.length > 0,
    };
  }, [isPatient, appointments, allDoctors, patientDepartments, pregnancies, babies]);

  return {
    specialization: isDoctor ? doctor?.specialization ?? '' : '',
    department,
    patientContext,
  };
}
