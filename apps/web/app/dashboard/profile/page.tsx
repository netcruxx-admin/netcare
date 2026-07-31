'use client';

import { RoleView } from '@/components/RoleView';
import { PatientProfile } from '@/components/profile/PatientProfile';
import { StaffProfile } from '@/components/profile/StaffProfile';
import { doctorRole, nurseRole, patientRole } from '@/lib/roles';

export default function ProfilePage() {
  return (
    <RoleView
      path="/dashboard/profile"
      views={{
        [doctorRole]: StaffProfile,
        [nurseRole]: StaffProfile,
        [patientRole]: PatientProfile,
      }}
    />
  );
}
