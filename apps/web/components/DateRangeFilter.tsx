'use client';

import { useState } from 'react';

export interface DateRange {
  from: string;
  to: string;
}

interface DateRangeFilterProps {
  value: DateRange;
  onChange: (value: DateRange) => void;
  className?: string;
  /** What "On date" resets to when the toggle switches back to single mode.
   *  Defaults to '' (no filter) if omitted. */
  defaultDate?: string;
  /** Latest date selectable in either mode — e.g. a billing report that can't
   *  reach into the future. Omit for no ceiling. */
  max?: string;
}

/**
 * A date filter that works as either a single day or a range, toggled
 * explicitly rather than inferred from the values — so picking the same
 * start and end day in range mode doesn't silently flip back to single
 * mode. Single mode keeps `from === to`, so a caller that only understands
 * one filter day (`from === to`) sees the same shape either way.
 *
 * The toggle itself commits a value, not just a UI state: switching to
 * "On date" resets the filter to `defaultDate` (rather than leaving
 * whichever range bound was last edited in place), so the toggle and the
 * data it drives never fall out of sync.
 */
export function DateRangeFilter({ value, onChange, className, defaultDate = '', max }: DateRangeFilterProps) {
  const [mode, setMode] = useState<'single' | 'range'>(value.from !== value.to ? 'range' : 'single');

  function setSingle(rawDate: string) {
    const date = max && rawDate > max ? max : rawDate;
    onChange({ from: date, to: date });
  }

  // Clamps the other bound only when the new pick would otherwise invert the
  // range (from > to) — that would silently filter to nothing. Also clamps to
  // `max`, as a backstop for a typed date that skips the native picker.
  function setFrom(rawDate: string) {
    const date = max && rawDate > max ? max : rawDate;
    onChange({ from: date, to: value.to && date > value.to ? date : value.to });
  }
  function setTo(rawDate: string) {
    const date = max && rawDate > max ? max : rawDate;
    onChange({ from: value.from && date < value.from ? date : value.from, to: date });
  }

  function switchToSingle() {
    setMode('single');
    onChange({ from: defaultDate, to: defaultDate });
  }
  function switchToRange() {
    setMode('range');
  }

  return (
    <div className={`flex items-center gap-2 ${className ?? ''}`}>
      <div className="flex bg-slate-100 rounded-lg p-0.5 text-xs font-medium shrink-0">
        <button
          type="button"
          onClick={switchToSingle}
          className={`px-2 py-1 rounded-md transition ${
            mode === 'single' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          On date
        </button>
        <button
          type="button"
          onClick={switchToRange}
          className={`px-2 py-1 rounded-md transition ${
            mode === 'range' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Between dates
        </button>
      </div>

      {mode === 'single' ? (
        <input
          type="date"
          value={value.from}
          max={max || undefined}
          onChange={(e) => setSingle(e.target.value)}
          className="bg-white rounded-lg shadow px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-500"
        />
      ) : (
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={value.from}
            max={(value.to && (!max || value.to < max) ? value.to : max) || undefined}
            onChange={(e) => setFrom(e.target.value)}
            className="bg-white rounded-lg shadow px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
          <span className="text-slate-400 text-sm">to</span>
          <input
            type="date"
            value={value.to}
            min={value.from || undefined}
            max={max || undefined}
            onChange={(e) => setTo(e.target.value)}
            className="bg-white rounded-lg shadow px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
        </div>
      )}
    </div>
  );
}
