'use client';

import { RoleView } from '@/components/RoleView';
import { DoctorPrescriptions } from '@/components/prescriptions/DoctorPrescriptions';
import { doctorRole } from '@/lib/roles';

export default function PrescriptionsPage() {
  return (
    <RoleView
      path="/dashboard/prescriptions"
      views={{
        [doctorRole]: DoctorPrescriptions,
      }}
    />
  );
}
