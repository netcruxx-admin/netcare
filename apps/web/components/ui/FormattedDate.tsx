import { fmtDate } from '@/lib/date';

interface FormattedDateProps {
  iso: string | null | undefined;
  fallback?: string;
  className?: string;
}

/**
 * Renders an ISO date string as "8 Aug 2026".
 * Safe against null / undefined — shows `fallback` (default "—") when missing.
 */
export function FormattedDate({ iso, fallback = '—', className }: FormattedDateProps) {
  return <span className={className}>{fmtDate(iso, fallback)}</span>;
}
