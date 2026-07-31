'use client';

import { RoleView } from '@/components/RoleView';
import { DoctorVideoConsults } from '@/components/video-consults/DoctorVideoConsults';
import { PatientVideoConsult } from '@/components/video-consults/PatientVideoConsult';
import { doctorRole, patientRole } from '@/lib/roles';

export default function VideoConsultsPage() {
  return (
    <RoleView
      path="/dashboard/video-consults"
      views={{
        [doctorRole]: DoctorVideoConsults,
        [patientRole]: PatientVideoConsult,
      }}
    />
  );
}
