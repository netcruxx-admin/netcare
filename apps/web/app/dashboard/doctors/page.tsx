'use client';

import { RoleView } from '@/components/RoleView';
import { AdminDoctors } from '@/components/doctors/AdminDoctors';
import { PlatformDoctors } from '@/components/doctors/PlatformDoctors';
import { AccessDeniedView } from '@/components/AccessDeniedView';
import { adminRole, receptionistRole, superadminRole } from '@/lib/roles';

export default function DoctorsPage() {
  return (
    <RoleView
      path="/dashboard/doctors"
      views={{
        [superadminRole]: PlatformDoctors,
        [adminRole]: AdminDoctors,
        // Holds doctors.read at scope "all" (needed for AdminBook's doctor
        // picker and the appointments board's filter), which would otherwise
        // fall through to AdminDoctors below — this entry is checked first.
        [receptionistRole]: AccessDeniedView,
      }}
      viewsByScope={{ all: AdminDoctors, own: AdminDoctors }}
    />
  );
}
