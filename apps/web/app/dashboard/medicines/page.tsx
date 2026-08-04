'use client';

import { RoleView } from '@/components/RoleView';
import { AdminMedicines } from '@/components/medicines/AdminMedicines';
import { adminRole } from '@/lib/roles';

export default function MedicinesPage() {
  return (
    <RoleView
      path="/dashboard/medicines"
      views={{
        [adminRole]: AdminMedicines,
      }}
    />
  );
}