'use client';

import { RoleView } from '@/components/RoleView';
import { AdmissionsList } from '@/components/admissions/AdmissionsList';
import {
  adminRole,
  doctorRole,
  nurseRole,
  receptionistRole,
  superadminRole,
} from '@/lib/roles';

export default function AdmissionsPage() {
  return (
    <RoleView
      path="/dashboard/admissions"
      views={{
        [superadminRole]: AdmissionsList,
        [adminRole]: AdmissionsList,
        [doctorRole]: AdmissionsList,
        [nurseRole]: AdmissionsList,
        [receptionistRole]: AdmissionsList,
      }}
      // A superadmin-invented role holding admissions.read at any scope gets
      // the same table — there is no shape difference to dispatch on here.
      viewsByScope={{ own: AdmissionsList, all: AdmissionsList }}
    />
  );
}
