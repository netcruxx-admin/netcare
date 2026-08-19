'use client';

import { X } from 'lucide-react';

interface Props {
  dateFrom: string;
  dateTo: string;
  onChange: (dateFrom: string, dateTo: string) => void;
}

export function DateRangeFilter({ dateFrom, dateTo, onChange }: Props) {
  const hasFilter = dateFrom || dateTo;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-sm text-slate-500 font-medium">Date:</span>
      <input
        type="date"
        value={dateFrom}
        max={dateTo || undefined}
        onChange={(e) => onChange(e.target.value, dateTo)}
        className="bg-white rounded-lg shadow px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-500"
      />
      <span className="text-slate-400 text-sm">—</span>
      <input
        type="date"
        value={dateTo}
        min={dateFrom || undefined}
        onChange={(e) => onChange(dateFrom, e.target.value)}
        className="bg-white rounded-lg shadow px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-500"
      />
      {hasFilter && (
        <button
          onClick={() => onChange('', '')}
          className="flex items-center gap-1 text-sm text-slate-400 hover:text-slate-600 transition"
        >
          <X className="w-3.5 h-3.5" /> Clear
        </button>
      )}
    </div>
  );
}
