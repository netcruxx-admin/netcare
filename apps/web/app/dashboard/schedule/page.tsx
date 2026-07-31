'use client';

import { RoleView } from '@/components/RoleView';
import { AdminSchedule } from '@/components/schedule/AdminSchedule';
import { DoctorSchedule } from '@/components/schedule/DoctorSchedule';
import { PatientSchedule } from '@/components/schedule/PatientSchedule';
import { adminRole, doctorRole, patientRole } from '@/lib/roles';

export default function SchedulePage() {
  return (
    <RoleView
      path="/dashboard/schedule"
      views={{
        [adminRole]: AdminSchedule,
        [doctorRole]: DoctorSchedule,
        [patientRole]: PatientSchedule,
      }}
    />
  );
}
