'use client';

import { RoleView } from '@/components/RoleView';
import { HospitalPatients } from '@/components/patients/HospitalPatients';
import { PlatformPatients } from '@/components/patients/PlatformPatients';
import { adminRole, doctorRole, nurseRole, superadminRole } from '@/lib/roles';

export default function PatientsPage() {
  return (
    <RoleView
      path="/dashboard/patients"
      views={{
        [adminRole]: HospitalPatients,
        [doctorRole]: HospitalPatients,
        [nurseRole]: HospitalPatients,
        [superadminRole]: PlatformPatients,
      }}
    />
  );
}
