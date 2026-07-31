'use client';

import { RoleView } from '@/components/RoleView';
import { AdminBook } from '@/components/book/AdminBook';
import { PatientBook } from '@/components/book/PatientBook';
import { adminRole, patientRole } from '@/lib/roles';

export default function BookPage() {
  return (
    <RoleView
      path="/dashboard/book"
      views={{
        [adminRole]: AdminBook,
        [patientRole]: PatientBook,
      }}
    />
  );
}
