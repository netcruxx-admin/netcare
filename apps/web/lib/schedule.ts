import type { ScheduleBlock, BlockType } from '@/lib/types';

export const BLOCK_LABEL: Record<BlockType, string> = {
  break: 'Break',
  ot: 'In OT',
  block: 'Blocked',
};

// Cell styling on the schedule boards (left border + soft fill per type).
export const BLOCK_CELL_STYLE: Record<BlockType, string> = {
  break: 'bg-amber-50 border-amber-400 text-amber-800',
  ot: 'bg-purple-50 border-purple-400 text-purple-800',
  block: 'bg-slate-100 border-slate-400 text-slate-600',
};

export const BLOCK_TYPE_OPTIONS: { value: BlockType; label: string }[] = [
  { value: 'break', label: 'Break' },
  { value: 'ot', label: 'In OT (surgery)' },
  { value: 'block', label: 'Blocked / Unavailable' },
];

// Parse a slot label like "10:30 AM" / "2:00 PM" to minutes since midnight.
export function slotMin(slot: string): number {
  const m = slot.trim().match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!m) return 0;
  let h = Number(m[1]);
  const mm = Number(m[2]);
  if (/pm/i.test(m[3]) && h !== 12) h += 12;
  if (/am/i.test(m[3]) && h === 12) h = 0;
  return h * 60 + mm;
}

// A 30-min grid of slot labels, 9:00 AM – 5:00 PM inclusive.
export const GRID_SLOTS: string[] = (() => {
  const out: string[] = [];
  for (let min = 9 * 60; min <= 17 * 60; min += 30) {
    const h = Math.floor(min / 60);
    const mm = min % 60;
    const mer = h >= 12 ? 'PM' : 'AM';
    let hh = h % 12;
    if (hh === 0) hh = 12;
    out.push(`${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')} ${mer}`);
  }
  return out;
})();

// The block (if any) covering a given minute of a doctor's day.
export function blockAtMinute(blocks: ScheduleBlock[], min: number): ScheduleBlock | null {
  return blocks.find((b) => slotMin(b.startTime) <= min && min < slotMin(b.endTime)) ?? null;
}

// The block covering a given slot label.
export function blockAtSlot(blocks: ScheduleBlock[], slot: string): ScheduleBlock | null {
  return blockAtMinute(blocks, slotMin(slot));
}

// Set of slot labels (from `slots`) that fall inside any block for this doctor/date.
/**
 * Which of `slots` a doctor is unavailable for on `date`.
 *
 * Takes the blocks rather than fetching them: this module is imported by both
 * client screens and shared helpers, and the blocks now come from the API, so
 * the caller owns the request and this stays a pure calculation.
 */
export function blockedSlotSet(
  blocks: ScheduleBlock[],
  doctorId: string,
  date: string,
  slots: string[],
): Set<string> {
  if (!doctorId || !date) return new Set();
  const onDay = blocks.filter((b) => b.doctorId === doctorId && b.date === date);
  return new Set(slots.filter((s) => blockAtSlot(onDay, s)));
}
