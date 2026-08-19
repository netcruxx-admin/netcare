'use client';

import { RoleView } from '@/components/RoleView';
import { AdminDoctors } from '@/components/doctors/AdminDoctors';
import { PlatformDoctors } from '@/components/doctors/PlatformDoctors';
import { adminRole, superadminRole } from '@/lib/roles';

export default function DoctorsPage() {
  return (
    <RoleView
      path="/dashboard/doctors"
      views={{
        [superadminRole]: PlatformDoctors,
        [adminRole]: AdminDoctors,
      }}
      viewsByScope={{ all: AdminDoctors, own: AdminDoctors }}
    />
  );
}
