'use client';

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

type Tone = 'default' | 'danger' | 'success';

const toneCls: Record<Tone, string> = {
  default: 'text-slate-500 hover:text-cyan-600 hover:bg-cyan-50',
  danger: 'text-slate-500 hover:text-red-600 hover:bg-red-50',
  success: 'text-slate-500 hover:text-green-600 hover:bg-green-50',
};

// Icon-only action with a styled tooltip on hover. Renders a link when `href`
// is given, otherwise a button.
export function ActionIcon({
  icon: Icon,
  label,
  onClick,
  href,
  tone = 'default',
}: {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
  href?: string;
  tone?: Tone;
}) {
  const cls = `p-2 rounded-lg transition ${toneCls[tone]}`;
  const inner = href ? (
    <Link href={href} aria-label={label} className={cls}>
      <Icon className="w-4 h-4" />
    </Link>
  ) : (
    <button type="button" onClick={onClick} aria-label={label} className={cls}>
      <Icon className="w-4 h-4" />
    </button>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>{inner}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
