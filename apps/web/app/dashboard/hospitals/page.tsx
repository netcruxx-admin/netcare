'use client';

import { RoleView } from '@/components/RoleView';
import { PlatformHospitals } from '@/components/hospitals/PlatformHospitals';
import { superadminRole } from '@/lib/roles';

export default function HospitalsPage() {
  return (
    <RoleView
      path="/dashboard/hospitals"
      views={{
        [superadminRole]: PlatformHospitals,
      }}
    />
  );
}
