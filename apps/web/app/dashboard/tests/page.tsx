'use client';

import { RoleView } from '@/components/RoleView';
import { AdminTests } from '@/components/tests/AdminTests';
import { adminRole, labRole } from '@/lib/roles';

export default function TestsPage() {
  return (
    <RoleView
      path="/dashboard/tests"
      views={{
        [adminRole]: AdminTests,
        [labRole]: AdminTests,
      }}
    />
  );
}
