'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { authStorage } from '@/lib/auth';
import { canRoleAccessPath, homePathForSession } from '@/lib/roles';
import type { AuthSession } from '@/lib/types';

/**
 * The access check for every dashboard page, in one place.
 *
 * Replaces the `if (!s || s.user.role !== 'doctor') router.push('/login')` block
 * that used to be copy-pasted into all ~46 pages. Which roles may open which
 * path is declared once in lib/roles.ts, so a page no longer names a role at
 * all — that is what lets one route serve every role.
 *
 * Returns null until the session is known (pages render nothing meanwhile),
 * since the session lives in localStorage and is unreadable during SSR.
 */
export function useDashboardGuard(path?: string): AuthSession | null {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<AuthSession | null>(null);

  const guardedPath = path ?? pathname;

  useEffect(() => {
    const stored = authStorage.getSession();
    if (!stored) {
      router.push('/login');
      return;
    }
    // Signed in but not entitled to this screen: send them to their own
    // dashboard rather than the login page, which would look like a logout.
    if (!canRoleAccessPath(stored.user.role, guardedPath)) {
      router.replace(homePathForSession(stored));
      return;
    }
    setSession(stored);
  }, [router, guardedPath]);

  return session;
}
