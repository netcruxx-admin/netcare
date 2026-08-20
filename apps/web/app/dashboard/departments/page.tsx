'use client';

import { RoleView } from '@/components/RoleView';
import { PlatformDepartments } from '@/components/departments/PlatformDepartments';
import { superadminRole } from '@/lib/roles';

export default function DepartmentsPage() {
  return (
    <RoleView
      path="/dashboard/departments"
      views={{
        [superadminRole]: PlatformDepartments,
      }}
    />
  );
}
