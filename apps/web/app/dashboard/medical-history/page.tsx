'use client';

import { RoleView } from '@/components/RoleView';
import { PatientMedicalHistory } from '@/components/medical-history/PatientMedicalHistory';
import { patientRole } from '@/lib/roles';

export default function MedicalHistoryPage() {
  return (
    <RoleView
      path="/dashboard/medical-history"
      views={{
        [patientRole]: PatientMedicalHistory,
      }}
    />
  );
}
