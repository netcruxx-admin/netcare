'use client';

import Link from 'next/link';
import type { HospitalModules } from '@/lib/types';
import { navRoutesForRole, routeLabel } from '@/lib/roles';
import { useGetCurrentHospitalQuery } from '@/store/api';
import { currentSubdomain } from '@/lib/tenant';
import { DashboardShell } from '@/components/DashboardShell';
import type { RoleViewProps } from '@/components/RoleView';
import { Spinner } from '@/components/ui/spinner';

/**
 * The landing page for a role the product doesn't ship a dashboard for —
 * anything the superadmin created at runtime.
 *
 * It shows the screens this user's grants actually unlock, which is the same
 * calculation the sidebar does. Without it, inventing a role would drop its
 * users on an empty page, and the permissions UI would look broken when it
 * isn't.
 */
export function GenericDashboard({ session }: RoleViewProps) {
  const { data: hospital, isLoading } = useGetCurrentHospitalQuery(undefined, { skip: !currentSubdomain() });
  const role = session.user.role;

  const routes = navRoutesForRole(role, {
    modules: (hospital?.modules ?? {}) as Partial<HospitalModules>,
    permissions: session.permissions,
  }).filter((r) => r.path !== '/dashboard');

  const roleLabel = session.role?.label ?? role;

  return (
    <DashboardShell
      role={role}
      userName={session.user.name}
      title={`Welcome, ${session.user.name}`}
      subtitle={`Signed in as ${roleLabel}`}
    >
      {isLoading ? (
        <Spinner variant="block" />
      ) : routes.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm py-16 px-6 text-center">
          <p className="text-slate-900 font-medium mb-1">No screens are available yet.</p>
          <p className="text-sm text-slate-500">
            The “{roleLabel}” role has no permissions granted. An administrator can
            add them from the Roles screen.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {routes.map((route) => {
            const Icon = route.icon;
            return (
              <Link
                key={route.path}
                href={route.path}
                className="group bg-white rounded-xl border border-slate-100 shadow-sm p-5 flex items-center gap-4 hover:shadow-md hover:border-cyan-200 transition"
              >
                <div className="w-11 h-11 rounded-lg bg-gradient-to-br from-cyan-500 to-teal-600 text-white flex items-center justify-center shrink-0">
                  <Icon className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900 group-hover:text-cyan-700 transition">
                    {routeLabel(route, role)}
                  </p>
                  <p className="text-xs text-slate-500 truncate">{route.path}</p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </DashboardShell>
  );
}
