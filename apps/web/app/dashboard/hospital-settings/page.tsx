'use client';

import { HospitalSettings } from '@/components/admin/HospitalSettings';
import { RoleView } from '@/components/RoleView';
import { adminRole } from '@/lib/roles';

export default function HospitalSettingsPage() {
  return (
    <RoleView
      path="/dashboard/hospital-settings"
      views={{ [adminRole]: HospitalSettings }}
    />
  );
}
