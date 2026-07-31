'use client';

import { RoleView } from '@/components/RoleView';
import { DoctorPregnancies } from '@/components/pregnancies/DoctorPregnancies';
import { PatientPregnancy } from '@/components/pregnancies/PatientPregnancy';
import { doctorRole, patientRole } from '@/lib/roles';

export default function PregnanciesPage() {
  return (
    <RoleView
      path="/dashboard/pregnancies"
      views={{
        [doctorRole]: DoctorPregnancies,
        [patientRole]: PatientPregnancy,
      }}
    />
  );
}
