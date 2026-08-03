'use client';

import { useEffect, useState } from 'react';
import { useDebounced } from './useDebounced';

/** How many rows a table asks for at a time unless it says otherwise. */
export const DEFAULT_PAGE_SIZE = 20;

export interface ServerTable {
  /** Bind to the search input — updates on every keystroke. */
  search: string;
  setSearch: (value: string) => void;
  /** The settled search term to send as `q`. Lags `search` by the debounce. */
  q: string;
  page: number;
  setPage: (page: number) => void;
  pageSize: number;
  /** Ready to spread into a paged query: `{ q, limit, offset }`. */
  limit: number;
  offset: number;
}

/**
 * Paging and search state for one server-paginated table.
 *
 * The rule this exists to enforce: whenever the *result set* changes — a new
 * search term, a different status filter — the table must go back to page 1.
 * Staying on page 4 of a result that now has one page shows an empty table and
 * looks like the filter broke. Screens pass every filter they send to the
 * server as `filterKey`, and the reset happens here rather than in each screen's
 * onChange handler, where it is easy to forget on the fifth filter.
 */
export function useServerTable({
  pageSize = DEFAULT_PAGE_SIZE,
  filterKey = '',
}: { pageSize?: number; filterKey?: string } = {}): ServerTable {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const q = useDebounced(search);

  useEffect(() => {
    setPage(1);
  }, [q, filterKey]);

  return {
    search,
    setSearch,
    q,
    page,
    setPage,
    pageSize,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  };
}
