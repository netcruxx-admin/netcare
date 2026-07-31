import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { platformOnlyPaths } from '@/lib/roles';

export function middleware(request: NextRequest) {
  const host = request.headers.get('host') ?? '';
  const hostname = host.split(':')[0]; // strip port
  const parts = hostname.split('.');

  // Detect subdomain: anything before "localhost" on local dev
  // e.g. "cityeyecare.localhost" → "cityeyecare"
  const isLocalhost = parts[parts.length - 1] === 'localhost';
  const subdomain = isLocalhost && parts.length > 1 ? parts[0] : null;

  const { pathname } = request.nextUrl;

  // The platform console is only reachable from the bare host (no subdomain).
  // Since the dashboard routes are no longer prefixed by role, this can only
  // match the screens that belong exclusively to the platform owner; who may
  // open any given route is decided by lib/roles.ts and the page guard.
  if (platformOnlyPaths.some((p) => pathname === p || pathname.startsWith(`${p}/`)) && subdomain) {
    const url = request.nextUrl.clone();
    url.hostname = 'localhost';
    return NextResponse.redirect(url);
  }

  const response = NextResponse.next();

  // Stamp the subdomain as a cookie so server components can read it
  if (subdomain) {
    response.cookies.set('x-hospital-subdomain', subdomain, {
      path: '/',
      sameSite: 'lax',
    });
  } else {
    response.cookies.delete('x-hospital-subdomain');
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
