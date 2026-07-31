'use client';

import { RoleView } from '@/components/RoleView';
import { PatientRecords } from '@/components/records/PatientRecords';
import { patientRole } from '@/lib/roles';

export default function RecordsPage() {
  return (
    <RoleView
      path="/dashboard/records"
      views={{
        [patientRole]: PatientRecords,
      }}
    />
  );
}
