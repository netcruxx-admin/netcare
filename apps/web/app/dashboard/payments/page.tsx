'use client';

import { RoleView } from '@/components/RoleView';
import { PatientPayments } from '@/components/payments/PatientPayments';
import { patientRole } from '@/lib/roles';

export default function PaymentsPage() {
  return (
    <RoleView
      path="/dashboard/payments"
      views={{
        [patientRole]: PatientPayments,
      }}
    />
  );
}
