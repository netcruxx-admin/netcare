'use client';

import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';

/** Portrait A4, width / height. */
const A4_RATIO = 210 / 297;
/** How far off A4 the source may be and still crop to its full extent — same
 *  tolerance the upload endpoint accepts. */
const A4_RATIO_TOLERANCE = 0.03;
/** The print-resolution floor the upload endpoint also enforces (~120 dpi at
 *  A4 — soft, but a letterhead is mostly frame behind crisp digital text). */
const MIN_W_PX = 1000;
const MIN_H_PX = 1414;

type Corner = 'nw' | 'ne' | 'sw' | 'se';

/** Crop rectangle, in the image's own pixels. Height is always w / A4_RATIO. */
interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** The biggest A4 rectangle that fits inside w x h, centred. */
function largestCentredRect(nw: number, nh: number): Rect {
  let w = nw;
  let h = w / A4_RATIO;
  if (h > nh) {
    h = nh;
    w = h * A4_RATIO;
  }
  return { x: (nw - w) / 2, y: (nh - h) / 2, w, h };
}

/**
 * Step one of setting up a letterhead: crop whatever the hospital picked down
 * to a portrait-A4 rectangle, in-app, so they never have to open an image
 * editor. The frame is locked to A4 proportions; the next step (the margin
 * picker) then marks the safe area inside it.
 *
 * The cropped region is drawn to a canvas at its native resolution and handed
 * on as a PNG — lossless, because a letterhead is mostly type and rules.
 */
export function LetterheadCropModal({
  imageUrl,
  fileName,
  busy,
  onCancel,
  onCropped,
}: {
  imageUrl: string;
  fileName: string;
  busy?: boolean;
  onCancel: () => void;
  onCropped: (file: File, url: string) => void;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const [dispW, setDispW] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [working, setWorking] = useState(false);

  const measure = useCallback(() => {
    if (imgRef.current) setDispW(imgRef.current.clientWidth);
  }, []);

  useLayoutEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  const onImgLoad = useCallback(() => {
    const el = imgRef.current;
    if (!el || !el.naturalWidth) return;
    const nw = el.naturalWidth;
    const nh = el.naturalHeight;
    setNat({ w: nw, h: nh });
    // An image already close to A4 starts with the whole page selected — no
    // stray band along an edge to tidy up. Only a genuinely wrong shape starts
    // with the largest A4 rectangle that fits.
    const withinA4 = Math.abs(nw / nh - A4_RATIO) <= A4_RATIO_TOLERANCE;
    setRect(withinA4 ? { x: 0, y: 0, w: nw, h: nh } : largestCentredRect(nw, nh));
    measure();
  }, [measure]);

  // A cached blob: URL (e.g. returning here via "Back to crop") can be
  // `complete` before React wires up onLoad — read it directly on mount.
  useLayoutEffect(() => {
    if (imgRef.current?.complete) onImgLoad();
  }, [onImgLoad]);

  const scale = nat && dispW ? dispW / nat.w : 1;

  const startMove = (e: React.PointerEvent) => {
    if (!rect || !nat) return;
    e.preventDefault();
    const origin = { px: e.clientX, py: e.clientY, rect };
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - origin.px) / scale;
      const dy = (ev.clientY - origin.py) / scale;
      setRect({
        ...origin.rect,
        x: clamp(origin.rect.x + dx, 0, nat.w - origin.rect.w),
        y: clamp(origin.rect.y + dy, 0, nat.h - origin.rect.h),
      });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const startResize = (corner: Corner) => (e: React.PointerEvent) => {
    if (!rect || !nat) return;
    e.preventDefault();
    e.stopPropagation();
    // The opposite corner stays put while this one moves.
    const anchor = {
      x: corner === 'nw' || corner === 'sw' ? rect.x + rect.w : rect.x,
      y: corner === 'nw' || corner === 'ne' ? rect.y + rect.h : rect.y,
    };
    const move = (ev: PointerEvent) => {
      const box = wrapRef.current?.getBoundingClientRect();
      if (!box) return;
      const px = clamp((ev.clientX - box.left) / scale, 0, nat.w);
      const py = clamp((ev.clientY - box.top) / scale, 0, nat.h);
      const dirX = px < anchor.x ? -1 : 1;
      const dirY = py < anchor.y ? -1 : 1;
      const roomX = dirX < 0 ? anchor.x : nat.w - anchor.x;
      const roomY = dirY < 0 ? anchor.y : nat.h - anchor.y;

      let w = Math.abs(px - anchor.x);
      w = Math.min(w, Math.abs(py - anchor.y) * A4_RATIO, roomX, roomY * A4_RATIO);
      w = Math.max(w, 40 / scale);
      const h = w / A4_RATIO;

      setRect({
        x: dirX < 0 ? anchor.x - w : anchor.x,
        y: dirY < 0 ? anchor.y - h : anchor.y,
        w,
        h,
      });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const outW = rect ? Math.round(rect.w) : 0;
  const outH = rect ? Math.round(rect.h) : 0;
  const tooSmall = !!rect && (outW < MIN_W_PX || outH < MIN_H_PX);
  const impossible = !!nat && Math.min(nat.w, nat.h * A4_RATIO) < MIN_W_PX;

  const finish = async () => {
    if (!rect || !nat || !imgRef.current || tooSmall) return;
    setWorking(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(rect.w);
      canvas.height = Math.round(rect.h);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no 2d context');
      ctx.drawImage(
        imgRef.current,
        rect.x, rect.y, rect.w, rect.h,
        0, 0, canvas.width, canvas.height,
      );
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
      if (!blob) throw new Error('crop produced no image');
      const stem = fileName.replace(/\.[^.]+$/, '') || 'letterhead';
      const file = new File([blob], `${stem}-a4.png`, { type: 'image/png' });
      onCropped(file, URL.createObjectURL(file));
    } finally {
      setWorking(false);
    }
  };

  const pct = rect && nat
    ? {
        left: `${(rect.x / nat.w) * 100}%`,
        top: `${(rect.y / nat.h) * 100}%`,
        width: `${(rect.w / nat.w) * 100}%`,
        height: `${(rect.h / nat.h) * 100}%`,
      }
    : null;

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Crop to A4</h2>
            <p className="text-sm text-slate-500">
              The frame is locked to A4 proportions. Next you&rsquo;ll mark where your header and footer end.
            </p>
          </div>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600" aria-label="Cancel">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-1 items-center justify-center overflow-auto bg-slate-100 p-6">
          <div ref={wrapRef} className="relative inline-block max-w-full touch-none select-none leading-none">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              src={imageUrl}
              alt="Letterhead to crop"
              onLoad={onImgLoad}
              className="block max-h-[58vh] w-auto max-w-full"
            />

            {pct && (
              <>
                {/* Dim everything outside the crop */}
                <div className="pointer-events-none absolute inset-x-0 top-0 bg-black/50" style={{ height: pct.top }} />
                <div
                  className="pointer-events-none absolute inset-x-0 bg-black/50"
                  style={{ top: `calc(${pct.top} + ${pct.height})`, bottom: 0 }}
                />
                <div className="pointer-events-none absolute left-0 bg-black/50" style={{ top: pct.top, height: pct.height, width: pct.left }} />
                <div
                  className="pointer-events-none absolute right-0 bg-black/50"
                  style={{ top: pct.top, height: pct.height, left: `calc(${pct.left} + ${pct.width})` }}
                />

                {/* Crop frame */}
                <div
                  onPointerDown={startMove}
                  className="absolute cursor-move border-2 border-cyan-400"
                  style={{ left: pct.left, top: pct.top, width: pct.width, height: pct.height }}
                >
                  <span className="absolute left-1/2 top-1 -translate-x-1/2 rounded bg-cyan-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    {outW} &times; {outH}
                  </span>
                  {(['nw', 'ne', 'sw', 'se'] as Corner[]).map((c) => (
                    <span
                      key={c}
                      onPointerDown={startResize(c)}
                      className={`absolute h-3.5 w-3.5 rounded-sm bg-white ring-2 ring-cyan-500 ${
                        c === 'nw' ? '-left-2 -top-2 cursor-nwse-resize' :
                        c === 'ne' ? '-right-2 -top-2 cursor-nesw-resize' :
                        c === 'sw' ? '-bottom-2 -left-2 cursor-nesw-resize' :
                        '-bottom-2 -right-2 cursor-nwse-resize'
                      }`}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="border-t px-6 py-4">
          {tooSmall && (
            <p className="mb-3 text-xs text-amber-600">
              {impossible
                ? `This image is too small for a printable A4 letterhead — it needs at least ${MIN_W_PX} px on the short side. Use a larger original.`
                : `Selected area is ${outW} × ${outH}px. A letterhead needs at least ${MIN_W_PX} × ${MIN_H_PX}px — select a larger area.`}
            </p>
          )}
          <div className="flex justify-end gap-3">
            <button
              onClick={onCancel}
              disabled={busy || working}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <Button
              onClick={finish}
              disabled={busy || working || !rect || tooSmall}
              variant="brand"
            >
              {working ? <Spinner size="sm" label="Preparing…" /> : 'Continue'}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
