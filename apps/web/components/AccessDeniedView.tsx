'use client';

import { ShieldOff } from 'lucide-react';
import { DashboardShell } from '@/components/DashboardShell';
import { portalTitleForRole } from '@/lib/roles';
import type { RoleViewProps } from '@/components/RoleView';

/**
 * Stands in for a screen a role has no business seeing, even though the
 * permission that gates the route is one they hold for another reason.
 *
 * `canAccessPath` (lib/roles.ts) checks only the route's `permission` — it
 * has no way to refuse one role without refusing everyone who shares that
 * permission. A receptionist holds `doctors.read` for AdminBook's doctor
 * picker and the appointments board's filter, so `/dashboard/doctors` stays
 * reachable for them; this is what a page maps that role's `views` entry to
 * instead of the real directory, so a direct visit reads as a refusal rather
 * than quietly working.
 */
export function AccessDeniedView({ session }: RoleViewProps) {
  return (
    <DashboardShell
      role={session.user.role}
      userName={session.user.name}
      title={portalTitleForRole(session.user.role)}
    >
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm py-16 px-6 text-center">
        <ShieldOff className="w-10 h-10 text-slate-300 mx-auto mb-3" />
        <p className="text-slate-900 font-medium mb-1">You don&apos;t have access to this page.</p>
        <p className="text-sm text-slate-500">
          Contact your hospital admin if you believe this is a mistake.
        </p>
      </div>
    </DashboardShell>
  );
}
