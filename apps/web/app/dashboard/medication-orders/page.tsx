'use client';

import { RoleView } from '@/components/RoleView';
import { MedicationOrders } from '@/components/medication-orders/MedicationOrders';
import { doctorRole, nurseRole, pharmacistRole } from '@/lib/roles';

export default function MedicationOrdersPage() {
  return (
    <RoleView
      path="/dashboard/medication-orders"
      views={{
        [doctorRole]: MedicationOrders,
        [nurseRole]: MedicationOrders,
        [pharmacistRole]: MedicationOrders,
      }}
    />
  );
}
