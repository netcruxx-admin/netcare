// -----------------------------------------------------------------------------
// Tenant-resolution seam — the ONE place that answers "which hospital am I?"
//
// The answer is only ever a hint for the backend: it resolves the tenant from
// the request host and, for an authenticated call, from the caller's own user
// row. Nothing here can widen what a user may see.
//
// Resolution priority:
//   1. Subdomain           — sunrise.localhost → "sunrise"  (URL is authoritative)
//   2. URL search param ?h — superadmin navigating to a tenant-scoped page
//   3. Nothing             — let the backend decide from the host
//
// There is deliberately no default tenant. Inventing one would make the client
// name a hospital it has no reason to believe in — and on a fresh install there
// are no hospitals at all until the platform onboards the first one.
// -----------------------------------------------------------------------------

/** The subdomain label of the current URL, or null on the bare host / SSR.
 *
 *  Mirrors `tenantLabel()` in middleware.ts and `_subdomain_label()` in the
 *  API's tenancy.py — three copies because they run in three places, and all
 *  three must agree about what counts as a tenant.
 */
export function currentSubdomain(): string | null {
  if (typeof window === 'undefined') return null;
  const host = window.location.hostname.toLowerCase(); // "hospa.netcare.co.in"
  const parts = host.split('.');
  // A single label is the bare host: "localhost", or an internal hostname.
  if (parts.length < 2) return null;
  // Ignore raw IPs (e.g. 127.0.0.1) — no subdomain there.
  if (/^\d+$/.test(parts[parts.length - 1])) return null;
  // The apex is not a tenant. Without knowing it, "netcare.co.in" reads as a
  // hospital called "netcare" — which is wrong on the platform's own front
  // door, and would silently resolve to a real tenant if anyone ever onboarded
  // that subdomain. The apex is the one thing the host cannot tell us, because
  // a three-label host is either an apex on a compound suffix (netcare.co.in)
  // or a tenant on a simple one (hospa.netcare.in).
  const apex = process.env.NEXT_PUBLIC_ROOT_DOMAIN?.toLowerCase();
  if (apex && host === apex) return null;
  const label = parts[0];
  if (!label || label === 'localhost' || label === 'www') return null;
  return label;
}

/**
 * The tenant hint to send with API calls, or "" when there is none.
 *
 * SSR-safe: returns "" with no window, so server render and first client render
 * agree and the backend falls back to host-based resolution either way.
 */
export function getCurrentHospitalId(): string {
  if (typeof window === 'undefined') return '';
  // On a hospital subdomain, send the label — the backend maps it to the id.
  const label = currentSubdomain();
  if (label) return label;
  // Superadmin deep-links carry the target hospital (e.g. /appointment/1?h=hosp-x)
  // so every query on that page scopes to it.
  return new URLSearchParams(window.location.search).get('h') ?? '';
}
