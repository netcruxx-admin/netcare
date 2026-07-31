'use client';

import { RoleView } from '@/components/RoleView';
import { DoctorCompleted } from '@/components/completed/DoctorCompleted';
import { doctorRole } from '@/lib/roles';

export default function CompletedPage() {
  return (
    <RoleView
      path="/dashboard/completed"
      views={{
        [doctorRole]: DoctorCompleted,
      }}
    />
  );
}
