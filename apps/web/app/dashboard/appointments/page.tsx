'use client';

import { RoleView } from '@/components/RoleView';
import { AdminAppointments } from '@/components/appointments/AdminAppointments';
import { DoctorAppointments } from '@/components/appointments/DoctorAppointments';
import { NurseAppointments } from '@/components/appointments/NurseAppointments';
import { PatientAppointments } from '@/components/appointments/PatientAppointments';
import { PlatformAppointments } from '@/components/appointments/PlatformAppointments';
import { adminRole, doctorRole, nurseRole, patientRole, superadminRole } from '@/lib/roles';

export default function AppointmentsPage() {
  return (
    <RoleView
      path="/dashboard/appointments"
      views={{
        [superadminRole]: PlatformAppointments,
        [adminRole]: AdminAppointments,
        [doctorRole]: DoctorAppointments,
        [nurseRole]: NurseAppointments,
        [patientRole]: PatientAppointments,
      }}
    />
  );
}
