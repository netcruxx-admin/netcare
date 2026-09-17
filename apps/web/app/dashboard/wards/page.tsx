'use client';

import { RoleView } from '@/components/RoleView';
import { WardsBedsHub } from '@/components/wards/WardsBedsHub';
import { adminRole, superadminRole } from '@/lib/roles';

export default function WardsPage() {
  return (
    <RoleView
      path="/dashboard/wards"
      views={{
        [adminRole]: WardsBedsHub,
        [superadminRole]: WardsBedsHub,
      }}
    />
  );
}
