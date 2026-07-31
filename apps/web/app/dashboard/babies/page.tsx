'use client';

import { RoleView } from '@/components/RoleView';
import { DoctorNewborns } from '@/components/babies/DoctorNewborns';
import { PatientBaby } from '@/components/babies/PatientBaby';
import { doctorRole, patientRole } from '@/lib/roles';

export default function BabiesPage() {
  return (
    <RoleView
      path="/dashboard/babies"
      views={{
        [doctorRole]: DoctorNewborns,
        [patientRole]: PatientBaby,
      }}
    />
  );
}
