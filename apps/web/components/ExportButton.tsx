'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { downloadCsv } from '@/lib/export';
import { Spinner } from '@/components/ui/spinner';

type Rows = (string | number | null | undefined)[][];

/**
 * Exports rows to a CSV download.
 *
 * On a server-paginated table `rows` holds only the visible page, which would
 * make "Export CSV" quietly export 20 of 5,000 rows. Such screens pass
 * `getRows` instead: it is awaited on click and fetches the whole filtered set,
 * so the export still means what the user thinks it means.
 */
export function ExportButton({
  filename,
  headers,
  rows,
  getRows,
  label = 'Export CSV',
}: {
  filename: string;
  headers: string[];
  rows: Rows;
  getRows?: () => Promise<Rows>;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);

  const handleClick = async () => {
    if (!getRows) {
      downloadCsv(filename, headers, rows);
      return;
    }
    setBusy(true);
    try {
      downloadCsv(filename, headers, await getRows());
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy || (!getRows && rows.length === 0)}
      className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {busy ? <Spinner size="sm" /> : <Download className="w-4 h-4" />}
      {busy ? 'Preparing…' : label}
    </button>
  );
}
