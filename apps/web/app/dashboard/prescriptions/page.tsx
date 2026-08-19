'use client';

import { RoleView } from '@/components/RoleView';
import { DoctorPrescriptions } from '@/components/prescriptions/DoctorPrescriptions';
import { PharmacistPrescriptions } from '@/components/prescriptions/PharmacistPrescriptions';
import { doctorRole, pharmacistRole } from '@/lib/roles';

export default function PrescriptionsPage() {
  return (
    <RoleView
      path="/dashboard/prescriptions"
      views={{
        [doctorRole]: DoctorPrescriptions,
        [pharmacistRole]: PharmacistPrescriptions,
      }}
    />
  );
}
