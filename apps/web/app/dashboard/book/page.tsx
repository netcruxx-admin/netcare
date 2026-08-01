'use client';

import { RoleView } from '@/components/RoleView';
import { AdminBook } from '@/components/book/AdminBook';
import { PatientBook } from '@/components/book/PatientBook';
import { SuperadminBook } from '@/components/book/SuperadminBook';
import { adminRole, patientRole, superadminRole } from '@/lib/roles';

export default function BookPage() {
  return (
    <RoleView
      path="/dashboard/book"
      views={{
        [superadminRole]: SuperadminBook,
        [adminRole]: AdminBook,
        [patientRole]: PatientBook,
      }}
    />
  );
}
