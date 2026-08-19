'use client';

import { RoleView } from '@/components/RoleView';
import { LabReports } from '@/components/reports/LabReports';
import { PatientReports } from '@/components/reports/PatientReports';
import { labRole, patientRole } from '@/lib/roles';

export default function ReportsPage() {
  return (
    <RoleView
      path="/dashboard/reports"
      views={{
        [labRole]: LabReports,
        [patientRole]: PatientReports,
      }}
    />
  );
}
