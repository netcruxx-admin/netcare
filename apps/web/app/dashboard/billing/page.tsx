'use client';

import { RoleView } from '@/components/RoleView';
import { PharmacyBillingPage } from '@/components/billing/PharmacyBillingPage';
import { pharmacistRole, adminRole } from '@/lib/roles';

export default function BillingPage() {
  return (
    <RoleView
      path="/dashboard/billing"
      views={{
        [pharmacistRole]: PharmacyBillingPage,
        [adminRole]: PharmacyBillingPage,
      }}
    />
  );
}
