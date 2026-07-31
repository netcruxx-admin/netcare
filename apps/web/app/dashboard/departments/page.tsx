'use client';

import { RoleView } from '@/components/RoleView';
import { AdminDepartments } from '@/components/departments/AdminDepartments';
import { PlatformDepartments } from '@/components/departments/PlatformDepartments';
import { adminRole, superadminRole } from '@/lib/roles';

export default function DepartmentsPage() {
  return (
    <RoleView
      path="/dashboard/departments"
      views={{
        [superadminRole]: PlatformDepartments,
        [adminRole]: AdminDepartments,
      }}
    />
  );
}
