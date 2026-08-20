'use client';

import { HospitalOperationalSettings } from '@/components/admin/HospitalOperationalSettings';
import { RoleView } from '@/components/RoleView';
import { adminRole } from '@/lib/roles';

export default function HospitalSettingsPage() {
  return (
    <RoleView
      path="/dashboard/hospital-settings"
      views={{ [adminRole]: HospitalOperationalSettings }}
    />
  );
}
