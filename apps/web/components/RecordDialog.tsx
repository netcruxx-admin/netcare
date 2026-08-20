'use client';

import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

/** One labelled fact about the record. */
export interface DetailField {
  label: string;
  /** Rendered as-is when a node, so a caller can pass a badge or a link.
   *  Empty strings, null, undefined and empty arrays all read as "not set". */
  value: ReactNode;
  /** Spans both columns — for descriptions and other long text. */
  wide?: boolean;
}

const isBlank = (value: ReactNode): boolean =>
  value === null
  || value === undefined
  || value === ''
  || (Array.isArray(value) && value.length === 0);

/**
 * Read-only detail for one row of a table.
 *
 * Tables have to stop at the handful of columns that fit; this is where the
 * rest of the record lives. Deliberately not the edit modal in a disabled
 * state — a disabled form still reads as "you may not touch this", when the
 * point here is simply to look. It also means a role with read but not manage
 * gets a real view instead of a greyed-out form.
 *
 * Fields with no value are kept rather than dropped: "Expiry —" tells the
 * reader the field exists and is empty, while omitting the row leaves them
 * wondering whether the system tracks it at all.
 */
export function RecordDialog({
  open,
  onClose,
  title,
  subtitle,
  fields,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: ReactNode;
  fields: DetailField[];
  /** Optional extra block under the fields — a table of line items, say. */
  footer?: ReactNode;
}) {
  // Escape closes. A read-only dialog should be dismissible without aiming for
  // a button — there is nothing here to lose by closing it.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="bg-white rounded-lg shadow-2xl max-w-lg w-full max-h-[85vh] flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        // The backdrop closes; a click that started inside the card must not
        // bubble out and close it too.
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 p-6 pb-4 border-b border-slate-100">
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-slate-900 truncate">{title}</h3>
            {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-slate-400 hover:text-slate-900 transition shrink-0 p-1 -m-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-5">
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
            {fields.map((field) => (
              <div key={field.label} className={field.wide ? 'sm:col-span-2' : undefined}>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  {field.label}
                </dt>
                <dd
                  className={`mt-1 text-sm break-words ${
                    isBlank(field.value) ? 'text-slate-400' : 'text-slate-900'
                  }`}
                >
                  {isBlank(field.value) ? '—' : field.value}
                </dd>
              </div>
            ))}
          </dl>
          {footer}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
