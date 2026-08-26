'use client';

import { Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * The one loading indicator in the app. Every "we are waiting" state — a button
 * mid-submit, a table before its first page arrives, a whole route — is this
 * component with a different `variant`, so the app never grows a second look.
 */

const SIZES = {
  xs: 'w-3 h-3',
  sm: 'w-4 h-4',
  md: 'w-6 h-6',
  lg: 'w-8 h-8',
  xl: 'w-12 h-12',
} as const;

export type SpinnerSize = keyof typeof SIZES;

export type SpinnerVariant =
  /** Sits in the flow — inside a button, beside a label. */
  | 'inline'
  /** Centred in a padded block — a card, a panel, a table body. */
  | 'block'
  /** Centred in the viewport — a whole route with nothing to show yet. */
  | 'page'
  /** Covers content that is being refreshed. Needs a `relative` parent. */
  | 'overlay';

export interface SpinnerProps {
  variant?: SpinnerVariant;
  size?: SpinnerSize;
  /** Rendered beside the spinner as visible text, and announced. */
  label?: string;
  /** For the app's dark surfaces — the consult room. Lightens the caption. */
  dark?: boolean;
  /** Extra classes for the outer element — the icon itself when `inline`. */
  className?: string;
}

const DEFAULT_SIZE: Record<SpinnerVariant, SpinnerSize> = {
  inline: 'sm',
  block: 'lg',
  page: 'xl',
  overlay: 'lg',
};

export function Spinner({ variant = 'inline', size, label, dark, className }: SpinnerProps) {
  // Inline spinners sit inside buttons and sentences that set their own colour
  // — a fixed cyan would vanish on a cyan button and clash on a red one. The
  // standalone variants sit on white, where the brand colour is the point.
  const spin = cn(
    SIZES[size ?? DEFAULT_SIZE[variant]],
    'animate-spin',
    variant === 'inline' ? 'text-current' : 'text-cyan-500',
  );

  // Inline lives inside something that already speaks — a button's own text, a
  // sentence. It only claims a label of its own when it has no visible one.
  if (variant === 'inline') {
    return (
      <>
        <Loader2
          className={cn(spin, className)}
          {...(label ? { 'aria-hidden': true } : { role: 'status', 'aria-label': 'Loading' })}
        />
        {label ? <span>{label}</span> : null}
      </>
    );
  }

  // The rest own their region: one live region, announced once, whether the
  // caption is visible or only for screen readers.
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex flex-col items-center justify-center gap-3',
        variant === 'overlay' && 'absolute inset-0 z-10 bg-white/70 backdrop-blur-[1px]',
        variant === 'page' && 'min-h-screen',
        variant === 'page' && (dark ? 'bg-slate-900' : 'bg-slate-100'),
        variant === 'block' && 'py-16',
        className,
      )}
    >
      <Loader2 className={spin} aria-hidden="true" />
      {label ? (
        <p className={cn('text-sm', dark ? 'text-slate-300' : 'text-slate-500')}>{label}</p>
      ) : (
        <span className="sr-only">Loading</span>
      )}
    </div>
  );
}
