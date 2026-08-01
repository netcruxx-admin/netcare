import type { TestOrderStatus } from '@/lib/types';
import type { ResultFlag } from '@/lib/types';

// Re-export the lab flag type (definition lives in ./types).
export type { ResultFlag } from '@/lib/types';

// Ordered lifecycle for lab test orders.
export const ORDER_STATUS_FLOW: TestOrderStatus[] = [
  'ordered',
  'sample_collected',
  'in_progress',
  'completed',
  'reviewed',
];

export const ORDER_STATUS_LABEL: Record<TestOrderStatus, string> = {
  ordered: 'Ordered',
  sample_collected: 'Sample Collected',
  in_progress: 'In Progress',
  completed: 'Completed',
  reviewed: 'Reviewed',
};

// Pill styling per status (icon/label always accompanies colour elsewhere).
export const ORDER_STATUS_STYLE: Record<TestOrderStatus, string> = {
  ordered: 'bg-slate-100 text-slate-700',
  sample_collected: 'bg-amber-100 text-amber-700',
  in_progress: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  reviewed: 'bg-purple-100 text-purple-700',
};

// The status the lab advances an order to next (null when at the last lab step).
export function nextLabStatus(status: TestOrderStatus): TestOrderStatus | null {
  const i = ORDER_STATUS_FLOW.indexOf(status);
  // Lab drives ordered -> sample_collected -> in_progress -> completed.
  if (i < 0 || status === 'completed' || status === 'reviewed') return null;
  return ORDER_STATUS_FLOW[i + 1];
}

export const FLAG_STYLE: Record<ResultFlag, string> = {
  normal: 'bg-green-100 text-green-700',
  low: 'bg-amber-100 text-amber-700',
  high: 'bg-amber-100 text-amber-700',
  critical: 'bg-red-100 text-red-700',
};

export const FLAG_LABEL: Record<ResultFlag, string> = {
  normal: 'Normal',
  low: 'Low',
  high: 'High',
  critical: 'Critical',
};

// Auto-derive a flag from a numeric value against a reference band.
export function computeFlag(value: string, low?: number, high?: number): ResultFlag {
  const n = Number(value);
  if (value.trim() === '' || Number.isNaN(n)) return 'normal';
  if (low !== undefined && n < low) return 'low';
  if (high !== undefined && n > high) return 'high';
  return 'normal';
}

export const isAbnormal = (flag: ResultFlag) => flag !== 'normal';
