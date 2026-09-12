'use client';

// Shared column sorting for every appointments table.
//
// The server-paged tables (admin / doctor / nurse / platform) pass `token` to
// their list query, which the API turns into an ORDER BY — so a sort covers the
// whole result set, not just the visible page. The patient's own history is
// small and already fully loaded, so it sorts in memory with `compareAppointments`.
//
// Sortable keys are the columns the row carries itself: `date`, `status`,
// `created`. Patient / doctor / department names are resolved after the query
// and are not offered as sort columns. Default everywhere: newest first.

import { useCallback, useState } from 'react';
import { ChevronDown, ChevronsUpDown, ChevronUp } from 'lucide-react';
import type { Appointment } from '@/lib/types';
import { TableHead } from '@/components/ui/table';

export type SortDir = 'asc' | 'desc';
export interface SortState {
  key: string;
  dir: SortDir;
}

/** Newest appointments first. */
export const NEWEST_FIRST: SortState = { key: 'date', dir: 'desc' };

// Date-like columns start descending (most recent first); everything else A→Z.
const defaultDir = (key: string): SortDir =>
  key === 'date' || key === 'created' ? 'desc' : 'asc';

export function useAppointmentSort(initial: SortState = NEWEST_FIRST) {
  const [sort, setSort] = useState<SortState>(initial);

  const toggle = useCallback((key: string) => {
    setSort((cur) =>
      cur.key === key
        ? { key, dir: cur.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: defaultDir(key) },
    );
  }, []);

  // The token the API expects, e.g. "-date". Also fed to `compareAppointments`.
  const token = `${sort.dir === 'desc' ? '-' : ''}${sort.key}`;

  return { sort, toggle, token };
}

// --- header cell ---------------------------------------------------------------

export function SortableTh({
  label,
  sortKey,
  sort,
  onSort,
  className = '',
  align = 'left',
}: {
  label: React.ReactNode;
  sortKey: string;
  sort: SortState;
  onSort: (key: string) => void;
  /** The table's own <th> classes — header styles differ between screens. */
  className?: string;
  align?: 'left' | 'right';
}) {
  const active = sort.key === sortKey;
  const Icon = !active ? ChevronsUpDown : sort.dir === 'asc' ? ChevronUp : ChevronDown;
  return (
    <TableHead
      className={className}
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`group inline-flex items-center gap-1 select-none transition hover:text-cyan-700 ${
          align === 'right' ? 'flex-row-reverse' : ''
        }`}
      >
        {label}
        <Icon
          className={`h-3.5 w-3.5 shrink-0 ${
            active ? 'text-cyan-600' : 'text-slate-400 group-hover:text-slate-500'
          }`}
        />
      </button>
    </TableHead>
  );
}

// --- client-side comparator (patient history) --------------------------------

function to24h(t: string): string {
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i.exec((t ?? '').trim());
  if (!m) return t ?? '';
  let h = Number(m[1]);
  const ap = m[3]?.toUpperCase();
  if (ap === 'PM' && h !== 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}

const cellValue = (a: Appointment, key: string): string => {
  switch (key) {
    case 'status':
      return a.status ?? '';
    case 'doctor':
      return (a.doctorName ?? '').toLowerCase();
    case 'patient':
      return (a.patientName ?? '').toLowerCase();
    case 'reason':
      return (a.reason ?? '').toLowerCase();
    case 'payment':
      return a.paymentStatus ?? '';
    case 'created':
      return a.createdAt ?? '';
    case 'mode':
      return a.mode ?? '';
    case 'date':
    default:
      return `${a.date ?? ''} ${to24h(a.time ?? '')}`;
  }
};

/** Comparator for a fully-loaded list. `sort` is the `{ key, dir }` from
 *  `useAppointmentSort`; ties break on id so the order is stable. */
export function compareAppointments(sort: SortState) {
  return (a: Appointment, b: Appointment): number => {
    const av = cellValue(a, sort.key);
    const bv = cellValue(b, sort.key);
    const base = av < bv ? -1 : av > bv ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    return sort.dir === 'asc' ? base : -base;
  };
}
