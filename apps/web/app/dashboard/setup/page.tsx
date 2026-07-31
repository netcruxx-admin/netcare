'use client';

import { RoleView } from '@/components/RoleView';
import { AdminSetup } from '@/components/setup/AdminSetup';
import { adminRole } from '@/lib/roles';

export default function SetupPage() {
  return (
    <RoleView
      path="/dashboard/setup"
      views={{
        [adminRole]: AdminSetup,
      }}
    />
  );
}
