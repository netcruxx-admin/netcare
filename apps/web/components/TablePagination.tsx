'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

/** Page numbers to render, with gaps collapsed to an ellipsis. */
function pageItems(current: number, total: number): (number | 'gap')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const keep = new Set(
    [1, total, current, current - 1, current + 1].filter((p) => p >= 1 && p <= total),
  );
  const sorted = [...keep].sort((a, b) => a - b);
  const out: (number | 'gap')[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push('gap');
    out.push(p);
  });
  return out;
}

/**
 * Pager for a server-paginated table.
 *
 * `total` is the number of rows matching the current filters across the whole
 * result, not the number on screen — it comes from the X-Total-Count header, so
 * the count stays honest once only one page has been fetched.
 */
export function TablePagination({
  page,
  pageSize,
  total,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  if (total <= pageSize) {
    return (
      <div className="px-6 py-3 border-t text-sm text-slate-500">
        {total === 0 ? 'No results' : `Showing all ${total}`}
      </div>
    );
  }

  const btn =
    'inline-flex items-center justify-center min-w-8 h-8 px-2 rounded-md text-sm font-medium transition disabled:opacity-40 disabled:cursor-not-allowed';

  return (
    <div className="px-6 py-3 border-t flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-slate-500">
        Showing <span className="font-medium text-slate-700">{first}–{last}</span> of{' '}
        <span className="font-medium text-slate-700">{total}</span>
      </p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
          className={`${btn} text-slate-600 hover:bg-slate-100`}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        {pageItems(page, pages).map((item, i) =>
          item === 'gap' ? (
            <span key={`gap-${i}`} className="px-1 text-slate-400">
              …
            </span>
          ) : (
            <button
              key={item}
              type="button"
              onClick={() => onPageChange(item)}
              aria-current={item === page ? 'page' : undefined}
              className={`${btn} ${
                item === page
                  ? 'bg-gradient-to-r from-cyan-500 to-brand-teal text-white shadow'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {item}
            </button>
          ),
        )}
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= pages}
          aria-label="Next page"
          className={`${btn} text-slate-600 hover:bg-slate-100`}
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
