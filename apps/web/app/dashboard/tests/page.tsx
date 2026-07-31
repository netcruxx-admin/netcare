'use client';

import { RoleView } from '@/components/RoleView';
import { AdminTests } from '@/components/tests/AdminTests';
import { LabCatalog } from '@/components/tests/LabCatalog';
import { adminRole, labRole } from '@/lib/roles';

export default function TestsPage() {
  return (
    <RoleView
      path="/dashboard/tests"
      views={{
        [adminRole]: AdminTests,
        [labRole]: LabCatalog,
      }}
    />
  );
}
