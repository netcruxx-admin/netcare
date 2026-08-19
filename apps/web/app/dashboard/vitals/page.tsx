'use client';

import { RoleView } from '@/components/RoleView';
import { NurseVitals } from '@/components/vitals/NurseVitals';
import { nurseRole } from '@/lib/roles';

export default function VitalsPage() {
  return (
    <RoleView
      path="/dashboard/vitals"
      views={{
        [nurseRole]: NurseVitals,
      }}
    />
  );
}
