import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Keep in sync with platformOnlyPaths in lib/roles.ts.
// Inlined here to avoid pulling lucide-react icons into the edge runtime.
const platformOnlyPaths = ['/dashboard/hospitals', '/dashboard/roles'];

// Keeps the platform console off tenant subdomains.
//
// The platform screens belong to the operator, not to any hospital, so reaching
// them from hospA.netcare.co.in is always a mistake — either a stale bookmark or
// someone probing. This is defence in depth rather than the access control
// itself: the backend gates those endpoints on `hospitals.manage` and would
// refuse a tenant admin anyway. What this adds is that the URL stops *looking*
// like it belongs to the hospital.

/** Hosts with no tenant subdomain, however many labels they carry.
 *
 *  `localhost` and bare IPs are the development cases. The apex and `www` are
 *  the platform's own front door — the operator signs in there, and there is no
 *  hospital called "www".
 */
const NON_TENANT_LABELS = new Set(['localhost', 'www']);

/** The tenant label of a request host, or null when there is not one.
 *
 *  Deliberately host-shaped rather than domain-specific: `hospA.netcare.co.in`,
 *  `hospA.localhost` and a preview host all resolve the same way, so nothing
 *  here needs to know what the production domain is. That also means this file
 *  does not have to change when the domain does.
 *
 *  Mirrors `currentSubdomain()` in lib/tenant.ts and `_subdomain_label()` in the
 *  API's tenancy.py. Three copies exist because they run in three places —
 *  middleware, browser, server — and all three must agree.
 */
function tenantLabel(host: string): string | null {
  const hostname = host.split(':')[0].toLowerCase();
  const parts = hostname.split('.');
  // A single label is the bare host: "localhost", or an internal hostname.
  if (parts.length < 2) return null;
  // A raw IP has no subdomain to read.
  if (/^\d+$/.test(parts[parts.length - 1])) return null;
  const label = parts[0];
  if (!label || NON_TENANT_LABELS.has(label)) return null;
  // `netcare.co.in` is the apex, not a tenant called "netcare". An apex on a
  // multi-part public suffix has three labels and no subdomain, so the only way
  // to tell it from `hospA.netcare.in` is to know the apex — hence the env var,
  // which is the one piece of deployment knowledge this cannot infer.
  const apex = process.env.NEXT_PUBLIC_ROOT_DOMAIN?.toLowerCase();
  if (apex && hostname === apex) return null;
  return label;
}

export function middleware(request: NextRequest) {
  const subdomain = tenantLabel(request.headers.get('host') ?? '');
  const { pathname } = request.nextUrl;

  const isPlatformPath = platformOnlyPaths.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  if (isPlatformPath && subdomain) {
    // Send them to the platform's own host. Derived by dropping the tenant
    // label rather than hardcoded, so this works on localhost and in production
    // without branching — the previous version rewrote the host to "localhost"
    // literally, which redirected production users onto their own machine.
    const url = request.nextUrl.clone();
    const hostname = (request.headers.get('host') ?? '').split(':')[0];
    url.hostname = hostname.split('.').slice(1).join('.') || hostname;
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
