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
  /** Route being rendered — the key the route table is consulted by. */
  path: string;
  /** Role code → view. A role absent here falls back to `viewsByScope`. */
  views: Record<string, ComponentType<RoleViewProps>>;
  /**
   * View to use for a role that has no entry in `views` — chosen by the scope
   * the route's permission was granted at. A superadmin-created role holding
   * `patients.read` at scope `all` wants the whole-hospital screen; one holding
   * it at `own` wants the personal one. Opt-in per page: without it, an unknown
   * role gets the notice below rather than a screen built for someone else.
   */
  viewsByScope?: Partial<Record<'own' | 'all', ComponentType<RoleViewProps>>>;
  /** Last resort when neither map matches — used by routes with no permission
   *  to key a scope off, such as the landing page. */
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
            The “{session.role?.label ?? session.user.role}” role has access to this
            page but no view has been built for it.
          </p>
        </div>
      </DashboardShell>
    );
  }

  return <View session={session} />;
}
