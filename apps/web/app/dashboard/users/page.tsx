'use client';

import { RoleView } from '@/components/RoleView';
import { AdminUsers } from '@/components/users/AdminUsers';
import { PlatformUsers } from '@/components/users/PlatformUsers';
import { adminRole, superadminRole } from '@/lib/roles';

export default function UsersPage() {
  return (
    <RoleView
      path="/dashboard/users"
      views={{
        [superadminRole]: PlatformUsers,
        [adminRole]: AdminUsers,
      }}
    />
  );
}
