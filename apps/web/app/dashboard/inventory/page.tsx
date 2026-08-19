'use client';

import { RoleView } from '@/components/RoleView';
import { InventoryManagement } from '@/components/inventory/InventoryManagement';
import { adminRole, pharmacistRole } from '@/lib/roles';

export default function InventoryPage() {
  return (
    <RoleView
      path="/dashboard/inventory"
      views={{
        [pharmacistRole]: InventoryManagement,
        [adminRole]: InventoryManagement,
      }}
    />
  );
}
