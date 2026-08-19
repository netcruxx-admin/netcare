/**
 * Formats an ISO date string (or datetime string) as "8 Aug 2026".
 * Safe against null / undefined — returns `fallback` (default "—") when the
 * value is missing.  Always appends T00:00:00 before parsing so the local
 * timezone never shifts the date to the previous day.
 */
export function fmtDate(iso: string | null | undefined, fallback = '—'): string {
  if (!iso) return fallback;
  return new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
