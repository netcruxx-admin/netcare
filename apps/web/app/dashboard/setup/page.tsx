'use client';

import { RoleView } from '@/components/RoleView';
import { HospitalSetup } from '@/components/setup/HospitalSetup';
import { superadminRole } from '@/lib/roles';

export default function SetupPage() {
  return (
    <RoleView
      path="/dashboard/setup"
      views={{
        [superadminRole]: HospitalSetup,
      }}
    />
  );
}
