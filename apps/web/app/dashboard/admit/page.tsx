'use client';

import { RoleView } from '@/components/RoleView';
import { AdmitPatientForm } from '@/components/admissions/AdmitPatientForm';
import { adminRole, doctorRole, receptionistRole, superadminRole } from '@/lib/roles';

export default function AdmitPage() {
  return (
    <RoleView
      path="/dashboard/admit"
      views={{
        [superadminRole]: AdmitPatientForm,
        [adminRole]: AdmitPatientForm,
        [doctorRole]: AdmitPatientForm,
        [receptionistRole]: AdmitPatientForm,
      }}
      // A superadmin-invented role holding admissions.create at either scope
      // gets the same form — mirrors /dashboard/book's fallback for the same reason.
      fallback={AdmitPatientForm}
    />
  );
}
