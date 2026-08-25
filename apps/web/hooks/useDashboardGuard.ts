'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { authStorage } from '@/lib/auth';
import { canAccessPath, homePathForSession } from '@/lib/roles';
import { useMeQuery } from '@/store/api';
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
 *
 * Permissions are always taken from the live /auth/me response so that changes
 * made in the Roles UI take effect immediately — no logout/login required.
 */
export function useDashboardGuard(path?: string): AuthSession | null {
  const router = useRouter();
  const pathname = usePathname();
  const [stored, setStored] = useState<AuthSession | null>(null);

  const guardedPath = path ?? pathname;

  useEffect(() => {
    const s = authStorage.getSession();
    if (!s) {
      router.push('/login');
      return;
    }
    // Always set stored so the /auth/me fetch starts immediately. The live
    // permissions are the authoritative check — the stored ones may be stale
    // (e.g. a grant added after the user last logged in).
    setStored(s);
  }, [router, guardedPath]);

  // Fetch live permissions from the server. Skip until we know the user is
  // logged in (stored !== null) to avoid an unauthenticated /auth/me call.
  const { data: meData } = useMeQuery(undefined, {
    skip: stored === null,
    refetchOnMountOrArgChange: 30,
    refetchOnFocus: true,
  });

  // Once live permissions arrive, enforce access. This is the authoritative
  // check — both grants added since login (allow) and revoked grants (deny)
  // are handled here without requiring a re-login.
  useEffect(() => {
    if (!stored || !meData?.permissions) return;
    if (!canAccessPath(meData.permissions, guardedPath)) {
      router.replace(homePathForSession(stored));
    }
  }, [stored, meData?.permissions, guardedPath, router]);

  // Overlay the fresh permissions on top of the stored session so that every
  // hasPermission() call in child components always sees the current grants.
  const session = useMemo<AuthSession | null>(() => {
    if (!stored) return null;
    if (!meData?.permissions) return stored;
    return { ...stored, permissions: meData.permissions };
  }, [stored, meData?.permissions]);

  return session;
}
