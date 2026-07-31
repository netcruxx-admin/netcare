'use client';

import { RoleView } from '@/components/RoleView';
import { AdminOverview } from '@/components/home/AdminOverview';
import { DoctorDashboard } from '@/components/home/DoctorDashboard';
import { LabDashboard } from '@/components/home/LabDashboard';
import { NurseDashboard } from '@/components/home/NurseDashboard';
import { PatientDashboard } from '@/components/home/PatientDashboard';
import { PlatformOverview } from '@/components/home/PlatformOverview';
import { adminRole, doctorRole, labRole, nurseRole, patientRole, superadminRole } from '@/lib/roles';

export default function HomePage() {
  return (
    <RoleView
      path="/dashboard"
      views={{
        [superadminRole]: PlatformOverview,
        [adminRole]: AdminOverview,
        [doctorRole]: DoctorDashboard,
        [nurseRole]: NurseDashboard,
        [labRole]: LabDashboard,
        [patientRole]: PatientDashboard,
      }}
    />
  );
}
