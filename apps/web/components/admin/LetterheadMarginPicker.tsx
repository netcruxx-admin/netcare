'use client';

import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { LetterheadMargins } from '@/store/api';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';

const A4_W_MM = 210;
const A4_H_MM = 297;
/** Smallest content box we let the two opposite margins leave between them. */
const MIN_GAP_MM = 25;
const MAX_MARGIN_MM = 130;

type Edge = 'top' | 'bottom' | 'left' | 'right';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * The visual step of setting up a full-page letterhead: the hospital drags four
 * guides to mark where their header band and footer end, and the box between
 * them is the area the printed bill or report is allowed to use.
 *
 * The image is shown locked to A4 proportions (the upload already enforces
 * that), so what is dragged here maps one-to-one to millimetres on the page.
 */
export function LetterheadMarginPicker({
  imageUrl,
  initial,
  busy,
  onBack,
  onCancel,
  onSave,
}: {
  imageUrl: string;
  initial: LetterheadMargins;
  busy?: boolean;
  /** When set, a "Back" button returns to the crop step. */
  onBack?: () => void;
  onCancel: () => void;
  onSave: (margins: LetterheadMargins) => void;
}) {
  const [m, setM] = useState<LetterheadMargins>(initial);
  const frameRef = useRef<HTMLDivElement>(null);

  const setEdge = (edge: Edge, mm: number) => {
    setM((prev) => {
      const next = { ...prev };
      if (edge === 'top') {
        next.top = Math.round(clamp(mm, 0, Math.min(MAX_MARGIN_MM, A4_H_MM - prev.bottom - MIN_GAP_MM)));
      } else if (edge === 'bottom') {
        next.bottom = Math.round(clamp(mm, 0, Math.min(MAX_MARGIN_MM, A4_H_MM - prev.top - MIN_GAP_MM)));
      } else if (edge === 'left') {
        next.left = Math.round(clamp(mm, 0, Math.min(MAX_MARGIN_MM, A4_W_MM - prev.right - MIN_GAP_MM)));
      } else {
        next.right = Math.round(clamp(mm, 0, Math.min(MAX_MARGIN_MM, A4_W_MM - prev.left - MIN_GAP_MM)));
      }
      return next;
    });
  };

  const startDrag = (edge: Edge) => (e: React.PointerEvent) => {
    e.preventDefault();
    const move = (ev: PointerEvent) => {
      const rect = frameRef.current?.getBoundingClientRect();
      if (!rect) return;
      if (edge === 'top') setEdge('top', ((ev.clientY - rect.top) / rect.height) * A4_H_MM);
      else if (edge === 'bottom') setEdge('bottom', ((rect.bottom - ev.clientY) / rect.height) * A4_H_MM);
      else if (edge === 'left') setEdge('left', ((ev.clientX - rect.left) / rect.width) * A4_W_MM);
      else setEdge('right', ((rect.right - ev.clientX) / rect.width) * A4_W_MM);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const pct = {
    top: `${(m.top / A4_H_MM) * 100}%`,
    bottom: `${(m.bottom / A4_H_MM) * 100}%`,
    left: `${(m.left / A4_W_MM) * 100}%`,
    right: `${(m.right / A4_W_MM) * 100}%`,
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Set the printable area</h2>
            <p className="text-sm text-slate-500">
              Drag the guides to where your header and footer end. Bills and reports stay inside the box.
            </p>
          </div>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600" aria-label="Cancel">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-6 sm:flex-row">
          {/* Preview */}
          <div className="mx-auto w-full max-w-[320px] shrink-0">
            <div
              ref={frameRef}
              className="relative w-full touch-none select-none overflow-hidden rounded border border-slate-300 bg-white shadow-inner"
              style={{ aspectRatio: `${A4_W_MM} / ${A4_H_MM}` }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl} alt="Letterhead" className="absolute inset-0 h-full w-full object-fill" />

              {/* Shaded no-go bands */}
              <div className="absolute inset-x-0 top-0 bg-slate-900/30" style={{ height: pct.top }} />
              <div className="absolute inset-x-0 bottom-0 bg-slate-900/30" style={{ height: pct.bottom }} />
              <div className="absolute inset-y-0 left-0 bg-slate-900/30" style={{ width: pct.left }} />
              <div className="absolute inset-y-0 right-0 bg-slate-900/30" style={{ width: pct.right }} />

              {/* Content box + sample lines */}
              <div
                className="absolute border-2 border-dashed border-cyan-500"
                style={{ top: pct.top, bottom: pct.bottom, left: pct.left, right: pct.right }}
              >
                <div className="space-y-1.5 p-2">
                  <div className="h-1.5 w-2/5 rounded bg-cyan-500/40" />
                  <div className="h-1 w-full rounded bg-slate-300" />
                  <div className="h-1 w-full rounded bg-slate-300" />
                  <div className="h-1 w-3/4 rounded bg-slate-300" />
                </div>
              </div>

              {/* Drag handles */}
              <Handle orientation="h" style={{ top: pct.top }} onPointerDown={startDrag('top')} />
              <Handle orientation="h" style={{ bottom: pct.bottom }} onPointerDown={startDrag('bottom')} />
              <Handle orientation="v" style={{ left: pct.left }} onPointerDown={startDrag('left')} />
              <Handle orientation="v" style={{ right: pct.right }} onPointerDown={startDrag('right')} />
            </div>
          </div>

          {/* Numeric controls */}
          <div className="flex-1">
            <p className="mb-3 text-sm font-medium text-slate-700">Margins (mm from each edge)</p>
            <div className="grid grid-cols-2 gap-3">
              {(['top', 'bottom', 'left', 'right'] as Edge[]).map((edge) => (
                <label key={edge} className="text-sm">
                  <span className="mb-1 block capitalize text-slate-500">{edge}</span>
                  <input
                    type="number"
                    min={0}
                    max={MAX_MARGIN_MM}
                    value={m[edge]}
                    onChange={(e) => setEdge(edge, Number(e.target.value) || 0)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 focus:border-cyan-500 focus:outline-none"
                  />
                </label>
              ))}
            </div>
            <p className="mt-4 text-xs text-slate-400">
              A4 is 210&thinsp;&times;&thinsp;297&thinsp;mm. The box must stay at least {MIN_GAP_MM}&thinsp;mm
              wide and tall.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t px-6 py-4">
          {onBack && (
            <button
              onClick={onBack}
              disabled={busy}
              className="mr-auto rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Back to crop
            </button>
          )}
          <button
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <Button
            onClick={() => onSave(m)}
            disabled={busy}
            variant="brand"
          >
            {busy ? <Spinner size="sm" label="Saving…" /> : 'Save letterhead'}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Handle({
  orientation,
  style,
  onPointerDown,
}: {
  orientation: 'h' | 'v';
  style: React.CSSProperties;
  onPointerDown: (e: React.PointerEvent) => void;
}) {
  const base = 'absolute bg-cyan-500';
  if (orientation === 'h') {
    return (
      <div
        onPointerDown={onPointerDown}
        style={style}
        className={`${base} inset-x-0 h-1 -translate-y-1/2 cursor-ns-resize`}
      >
        <span className="absolute left-1/2 top-1/2 h-3 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-500 ring-2 ring-white" />
      </div>
    );
  }
  return (
    <div
      onPointerDown={onPointerDown}
      style={style}
      className={`${base} inset-y-0 w-1 -translate-x-1/2 cursor-ew-resize`}
    >
      <span className="absolute left-1/2 top-1/2 h-8 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-500 ring-2 ring-white" />
    </div>
  );
}
