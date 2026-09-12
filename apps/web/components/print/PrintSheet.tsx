'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Printer, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface LetterheadMargins {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** The shape every print header shares. `PrintHeader` (lab report, prescription)
 *  and `InvoiceSeller` (bill) both satisfy it — the bill just carries a GSTIN as
 *  well, which the sheet does not touch. */
export interface PrintSheetHeader {
  name: string;
  legalName?: string;
  address?: string;
  phone?: string;
  email?: string;
  /** A full-page A4 letterhead. When set, the sheet switches to letterhead
   *  mode: the image is the page background and content is confined to the
   *  declared margin box. */
  letterheadUrl?: string;
  logoUrl?: string;
  letterheadMargins?: LetterheadMargins;
}

interface PrintSheetProps {
  header: PrintSheetHeader;
  /** "Tax Invoice", "Lab Report" — shown at the top of the sheet. */
  docLabel: string;
  /** Invoice number, order id. */
  docNumber?: string;
  /** Gate for `autoPrint`: pass the query's loaded state so the dialog opens
   *  on a finished sheet, not a spinner. Ignored when `autoPrint` is false. */
  ready?: boolean;
  /** Open the print dialog automatically once `ready`. Only for sheets reached
   *  *in order to print* — the invoice, opened in its own tab. A sheet reached
   *  by a "View" link (the lab report) leaves this off and prints only when the
   *  reader clicks the button. `?autoprint=0` overrides it off either way. */
  autoPrint?: boolean;
  /** Always render plain mode, even when the hospital has a letterhead. For
   *  bills that must never carry it regardless of hospital configuration. */
  forcePlain?: boolean;
  children: React.ReactNode;
}

const DEFAULT_MARGINS: LetterheadMargins = { top: 48, bottom: 32, left: 18, right: 18 };

/**
 * One A4 sheet for anything a tenant hands a patient on paper.
 *
 * Two modes, decided by whether the hospital uploaded a full-page letterhead:
 *
 * - **Letterhead mode.** The artwork is the page background (full-bleed, and
 *   repeated on every printed page); content is confined to the margin box the
 *   hospital declared, on every page, via `@page` margins. The sheet draws no
 *   identity block or footer of its own — the paper already carries the name,
 *   address, GST number and contact details.
 * - **Plain mode.** Today's behaviour: a text/logo header, a bordered footer,
 *   a 14mm page margin. Used when there is no letterhead.
 *
 * When `autoPrint` is set, the dialog opens on its own once `ready` — it waits
 * for images so the letterhead is on the page, fires exactly once, and is
 * suppressed by `?autoprint=0`. Without `autoPrint` the sheet just renders and
 * the reader prints from the button.
 */
export function PrintSheet({ header, docLabel, docNumber, ready = true, autoPrint = false, forcePlain = false, children }: PrintSheetProps) {
  const router = useRouter();
  const firedRef = useRef(false);

  useEffect(() => {
    if (!autoPrint || !ready || firedRef.current) return;
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('autoprint') === '0') {
      firedRef.current = true;
      return;
    }

    const fire = () => {
      if (firedRef.current) return;
      firedRef.current = true;
      window.print();
    };

    const pending = Array.from(document.images).filter((img) => !img.complete);
    if (pending.length === 0) {
      fire();
      return;
    }

    let settled = 0;
    const onSettle = () => {
      if (++settled >= pending.length) fire();
    };
    pending.forEach((img) => {
      img.addEventListener('load', onSettle);
      img.addEventListener('error', onSettle);
    });
    // A letterhead that never loads should not block the sheet forever.
    const safety = setTimeout(fire, 3000);

    return () => {
      clearTimeout(safety);
      pending.forEach((img) => {
        img.removeEventListener('load', onSettle);
        img.removeEventListener('error', onSettle);
      });
    };
  }, [autoPrint, ready]);

  const close = () => {
    // A bill opens in its own tab (window.open keeps `opener`), so close it.
    // A lab report is reached by an in-app link, so step back instead.
    if (window.opener) window.close();
    else router.back();
  };

  return (
    <>
      <div className="no-print mx-auto max-w-3xl px-4 pt-6 flex items-center justify-between">
        <button
          onClick={close}
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          <X className="h-4 w-4" /> Close
        </button>
        <Button
          onClick={() => window.print()}
          variant="brand"
        >
          <Printer className="h-4 w-4" /> Print / Save PDF
        </Button>
      </div>

      {header.letterheadUrl && !forcePlain ? (
        <LetterheadFrame
          url={header.letterheadUrl}
          margins={header.letterheadMargins ?? DEFAULT_MARGINS}
          docLabel={docLabel}
          docNumber={docNumber}
        >
          {children}
        </LetterheadFrame>
      ) : (
        <PlainFrame header={header} docLabel={docLabel} docNumber={docNumber}>
          {children}
        </PlainFrame>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Letterhead mode — the hospital's full-page artwork as the background
// ---------------------------------------------------------------------------

function LetterheadFrame({
  url,
  margins: m,
  docLabel,
  docNumber,
  children,
}: {
  url: string;
  margins: LetterheadMargins;
  docLabel: string;
  docNumber?: string;
  children: React.ReactNode;
}) {
  // The page has no margin (see PrintLayout), so `position: fixed` fills the
  // whole sheet with nothing clipped, and Chrome repeats it on every printed
  // page. The content is held off the letterhead's header/footer by its own
  // padding — the millimetres the hospital declared.
  // Caveat: padding only insets the top of page 1. A report that runs to a
  // second page starts its overflow at the sheet edge; bills are always one
  // page, and that is the case this is built for.
  const pad = `${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm`;
  const css = `
    @media print {
      .lh-bg {
        position: fixed;
        inset: 0;
        width: 100%; height: 100%;
        object-fit: fill;
        z-index: 0;
      }
      .lh-content { position: relative; z-index: 1; padding: ${pad}; }
      .lh-page { width: auto !important; min-height: 0 !important; margin: 0 !important;
                 background: transparent !important;
                 box-shadow: none !important; overflow: visible !important; }
    }
    @media screen {
      .lh-page {
        position: relative;
        width: 210mm; min-height: 297mm;
        margin: 24px auto;
        background: #fff;
        overflow: hidden;
        box-shadow: 0 2px 18px rgba(15, 23, 42, 0.18);
      }
      .lh-bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: fill; }
      .lh-content { position: relative; padding: ${pad}; }
    }
  `;

  return (
    <div className="lh-page">
      <style>{css}</style>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="lh-bg" src={url} alt="" />
      <div className="lh-content">
        <div className="mb-4 flex items-end justify-between">
          <span className="text-sm font-bold uppercase tracking-wider text-slate-800">{docLabel}</span>
          {docNumber && <span className="font-mono text-xs text-slate-500">{docNumber}</span>}
        </div>
        {children}
        <p className="mt-8 text-[10px] text-slate-400">
          Computer-generated {docLabel.toLowerCase()} — no signature required.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Plain mode — no letterhead, so the sheet draws its own header and footer
// ---------------------------------------------------------------------------

function PlainFrame({
  header,
  docLabel,
  docNumber,
  children,
}: {
  header: PrintSheetHeader;
  docLabel: string;
  docNumber?: string;
  children: React.ReactNode;
}) {
  const identity = (
    <div className="leading-relaxed">
      <div className="text-xl font-bold text-slate-900">{header.legalName || header.name}</div>
      {header.address && <div className="text-sm text-slate-500">{header.address}</div>}
      {header.phone && <div className="text-sm text-slate-500">{header.phone}</div>}
      {header.email && <div className="text-sm text-slate-500">{header.email}</div>}
    </div>
  );

  return (
    <div className="plain-sheet mx-auto my-8 max-w-3xl bg-white shadow print:my-0 print:shadow-none">
      {/* Page margin is 0 (PrintLayout), so the sheet supplies its own 14mm
          print inset and the inner sections drop their horizontal padding. */}
      <style>{`
        @media print {
          .plain-sheet { max-width: none !important; padding: 14mm !important; }
          .plain-sheet > * { padding-left: 0 !important; padding-right: 0 !important; }
        }
      `}</style>
      <header className="px-8 pt-8">
        {header.logoUrl ? (
          <div className="flex items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={header.logoUrl} alt="" className="h-16 w-16 shrink-0 object-contain" />
            {identity}
          </div>
        ) : (
          identity
        )}

        <div className="mt-4 flex items-end justify-between border-b-2 border-slate-800 pb-3">
          <span className="text-base font-bold uppercase tracking-wider text-slate-800">{docLabel}</span>
          {docNumber && <span className="font-mono text-xs text-slate-500">{docNumber}</span>}
        </div>
      </header>

      <div className="px-8 py-6">{children}</div>

      <div className="border-t px-8 py-5 text-center text-xs text-slate-400">
        This is a computer-generated {docLabel.toLowerCase()} and does not require a signature.
      </div>
    </div>
  );
}
