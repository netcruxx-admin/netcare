'use client';

import { RoleView } from '@/components/RoleView';
import { PlatformRoles } from '@/components/roles/PlatformRoles';
import { superadminRole } from '@/lib/roles';

export default function RolesPage() {
  return (
    <RoleView
      path="/dashboard/roles"
      views={{
        [superadminRole]: PlatformRoles,
      }}
    />
  );
}
