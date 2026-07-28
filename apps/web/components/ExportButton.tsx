'use client';

import { Download } from 'lucide-react';
import { downloadCsv } from '@/lib/export';

// Exports the provided rows to a CSV download. Disabled when there's nothing to export.
export function ExportButton({
  filename,
  headers,
  rows,
  label = 'Export CSV',
}: {
  filename: string;
  headers: string[];
  rows: (string | number | null | undefined)[][];
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => downloadCsv(filename, headers, rows)}
      disabled={rows.length === 0}
      className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <Download className="w-4 h-4" /> {label}
    </button>
  );
}
