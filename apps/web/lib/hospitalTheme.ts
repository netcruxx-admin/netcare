// Caches a tenant's brand colours in localStorage, keyed by subdomain.
//
// DashboardShell fetches the live theme from GET /hospitals/current on every
// mount, same as any other RTK Query call — there is no reason to trust a
// stale value over it. But that fetch takes a round trip, and until it
// resolves the shell has to paint *something*: without a cache it paints the
// generic default, then repaints in the tenant's real colour the moment the
// fetch lands, which is the visible "flash" this cache exists to avoid. A
// cached value lets the very first frame already be right for a tenant this
// browser has seen before; the live fetch still runs and overwrites it.
import { HOSPITAL_THEME_CACHE_PREFIX } from './constants';

export interface HospitalTheme {
  primary: string;
  primaryDark: string;
}

export const hospitalThemeCache = {
  get: (subdomain: string | null): HospitalTheme | null => {
    if (typeof window === 'undefined' || !subdomain) return null;
    try {
      const stored = localStorage.getItem(HOSPITAL_THEME_CACHE_PREFIX + subdomain);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  },

  set: (subdomain: string | null, theme: HospitalTheme) => {
    if (typeof window === 'undefined' || !subdomain) return;
    try {
      localStorage.setItem(HOSPITAL_THEME_CACHE_PREFIX + subdomain, JSON.stringify(theme));
    } catch {
      // Storage full or blocked (private browsing). The fetched theme still
      // applies for this visit — it just won't pre-paint the next one.
    }
  },
};
