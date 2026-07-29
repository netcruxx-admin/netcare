// -----------------------------------------------------------------------------
// Tenant-resolution seam — the ONE place that answers "which hospital am I?"
//
// This is the runtime counterpart to the multi-tenant data model in db.ts (every
// row carries a `hospitalId`). Keep this file dependency-free (no imports from
// db.ts / hospitalConfig.ts) so both of those can import it without a cycle.
//
// Resolution priority:
//   1. Subdomain           — sunrise.localhost → 'hosp-2'   (URL is authoritative)
//   2. localStorage switch — set by the in-app hospital switcher / onboarding
//   3. Default             — the flagship tenant
//
// On real subdomains the browser gives each origin its own localStorage, so
// tenants are naturally isolated; on the bare host the localStorage switch lets
// you flip between tenants that all live in one store (best for demoing scoping).
// -----------------------------------------------------------------------------

import { ACTIVE_HOSPITAL_KEY, DEFAULT_HOSPITAL_ID } from './constants';

// Re-export for back-compat (definitions live in ./constants).
export { ACTIVE_HOSPITAL_KEY, DEFAULT_HOSPITAL_ID } from './constants';

// subdomain label → hospitalId. Populated by the registry at import time via
// registerTenantSubdomains() so this file needn't know the tenant catalog.
const subdomainMap: Record<string, string> = {};

/** Registry calls this so subdomain resolution knows the tenant catalog. */
export function registerTenantSubdomains(map: Record<string, string>): void {
  Object.assign(subdomainMap, map);
}

/** The subdomain label of the current URL, or null on the bare host / SSR. */
export function currentSubdomain(): string | null {
  if (typeof window === 'undefined') return null;
  const host = window.location.hostname; // e.g. "sunrise.localhost" or "localhost"
  const label = host.split('.')[0];
  if (!label || label === 'localhost' || label === 'www') return null;
  // Ignore raw IPs (e.g. 127.0.0.1) — no subdomain there.
  if (/^\d+$/.test(label)) return null;
  return label;
}

/** Maps the URL subdomain to a hospitalId, if it names a known tenant. */
export function resolveFromSubdomain(): string | null {
  const label = currentSubdomain();
  return label ? subdomainMap[label] ?? null : null;
}

/**
 * The active tenant id. SSR-safe: returns the default when there's no window,
 * so server render and first client render agree (avoids hydration mismatch);
 * client code that needs the resolved tenant should read it after mount.
 */
export function getCurrentHospitalId(): string {
  if (typeof window === 'undefined') return DEFAULT_HOSPITAL_ID;
  // If on a hospital subdomain (e.g. cityeyecare.localhost:3000), send the
  // subdomain label — the backend resolves it to the real hospital ID.
  const label = currentSubdomain();
  if (label) return label;
  const stored = localStorage.getItem(ACTIVE_HOSPITAL_KEY);
  if (stored) return stored;
  return DEFAULT_HOSPITAL_ID;
}

/**
 * Switch the active tenant (in-app switcher / onboarding). Persists to
 * localStorage; callers typically reload so all data reads re-scope cleanly.
 */
export function setCurrentHospitalId(id: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(ACTIVE_HOSPITAL_KEY, id);
  }
}

/** Clears an explicit switch, falling back to subdomain/default resolution. */
export function clearHospitalOverride(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(ACTIVE_HOSPITAL_KEY);
  }
}
