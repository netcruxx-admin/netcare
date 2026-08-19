'use client';

import { RoleView } from '@/components/RoleView';
import { DoctorLabOrders } from '@/components/lab-orders/DoctorLabOrders';
import { LabOrders } from '@/components/lab-orders/LabOrders';
import { doctorRole, labRole } from '@/lib/roles';

export default function LabOrdersPage() {
  return (
    <RoleView
      path="/dashboard/lab-orders"
      views={{
        [doctorRole]: DoctorLabOrders,
        [labRole]: LabOrders,
      }}
    />
  );
}
