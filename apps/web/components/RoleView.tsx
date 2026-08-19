'use client';

import type { ComponentType } from 'react';
import { useDashboardGuard } from '@/hooks/useDashboardGuard';
import { DashboardShell } from '@/components/DashboardShell';
import { findRoute, permissionScope, portalTitleForRole } from '@/lib/roles';
import type { AuthSession } from '@/lib/types';

/** Every role view receives the signed-in session; nothing else is implicit. */
export interface RoleViewProps {
  session: AuthSession;
}

/**
 * Renders the view belonging to the signed-in user's role.
 *
 * This is the whole role-based routing mechanism: a feature has one route
 * (/dashboard/appointments), and the page hands off to the view for whoever is
 * signed in. Access is already settled by useDashboardGuard against the route
 * table, so a view never checks a role itself.
 */
export function RoleView({
  path,
  views,
  viewsByScope,
  fallback,
}: {
  path: string;
  views: Record<string, ComponentType<RoleViewProps>>;
  viewsByScope?: Partial<Record<'own' | 'all', ComponentType<RoleViewProps>>>;
  fallback?: ComponentType<RoleViewProps>;
}) {
  const session = useDashboardGuard(path);
  if (!session) return null;

  const permission = findRoute(path)?.permission;
  const scope = permission ? permissionScope(session.permissions, permission) : undefined;
  const View =
    views[session.user.role] ??
    (scope === 'own' || scope === 'all' ? viewsByScope?.[scope] : undefined) ??
    fallback;
  if (!View) {
    // Reachable when a route lists a role that has no view yet — a custom role
    // granted access, for instance. Better than a blank screen.
    return (
      <DashboardShell
        role={session.user.role}
        userName={session.user.name}
        title={portalTitleForRole(session.user.role)}
        subtitle="This screen is not available for your role"
      >
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm py-16 px-6 text-center">
          <p className="text-slate-900 font-medium mb-1">Nothing to show here yet.</p>
          <p className="text-sm text-slate-500">
            The "{session.role?.label ?? session.user.role}" role has access to this
            page but no view has been built for it.
          </p>
        </div>
      </DashboardShell>
    );
  }

  return <View session={session} />;
}
