'use client';

import { useState } from 'react';
import { Clock } from 'lucide-react';
import { toast } from 'sonner';
import {
  useGetHospitalOperationalQuery,
  useUpdateHospitalOperationalMutation,
} from '@/store/api';
import { DashboardShell } from '@/components/DashboardShell';
import type { RoleViewProps } from '@/components/RoleView';

// 30-minute time options in 24-hour "HH:MM" format, covering 06:00–21:00.
const TIME_OPTIONS: { value: string; label: string }[] = (() => {
  const opts: { value: string; label: string }[] = [];
  for (let min = 6 * 60; min <= 21 * 60; min += 30) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    const hhmm = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    const mer = h >= 12 ? 'PM' : 'AM';
    let hh = h % 12;
    if (hh === 0) hh = 12;
    const label = `${String(hh).padStart(2, '0')}:${String(m).padStart(2, '0')} ${mer}`;
    opts.push({ value: hhmm, label });
  }
  return opts;
})();

export function HospitalOperationalSettings({ session }: RoleViewProps) {
  const { data, isLoading } = useGetHospitalOperationalQuery();
  const [updateOperational, { isLoading: isSaving }] = useUpdateHospitalOperationalMutation();

  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');

  // Populate once data lands (only on first load)
  const lunchBreakStart = start || data?.lunchBreakStart || '12:00';
  const lunchBreakEnd = end || data?.lunchBreakEnd || '14:00';

  const handleSave = async () => {
    if (lunchBreakStart >= lunchBreakEnd) {
      toast.error('Break end time must be after start time');
      return;
    }
    try {
      await updateOperational({ lunchBreakStart, lunchBreakEnd }).unwrap();
      toast.success('Lunch break updated');
    } catch {
      toast.error('Failed to save settings');
    }
  };

  return (
    <DashboardShell
      role={session.user.role}
      userName={session.user.name}
      title="Hospital Settings"
      subtitle="Configure operational settings for your hospital"
    >
      <div className="max-w-lg">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-cyan-50 rounded-lg">
              <Clock className="w-5 h-5 text-cyan-600" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-800">Lunch Break</h2>
              <p className="text-sm text-slate-500">
                Slots within this window are blocked for all bookings.
              </p>
            </div>
          </div>

          {isLoading ? (
            <p className="text-sm text-slate-400">Loading…</p>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Break starts
                </label>
                <select
                  value={lunchBreakStart}
                  onChange={(e) => setStart(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                >
                  {TIME_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Break ends
                </label>
                <select
                  value={lunchBreakEnd}
                  onChange={(e) => setEnd(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                >
                  {TIME_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <p className="text-xs text-slate-400">
            Currently blocked:{' '}
            <span className="font-medium text-slate-600">
              {TIME_OPTIONS.find((o) => o.value === lunchBreakStart)?.label ?? lunchBreakStart}
              {' – '}
              {TIME_OPTIONS.find((o) => o.value === lunchBreakEnd)?.label ?? lunchBreakEnd}
            </span>
          </p>

          <div className="flex justify-end">
            <button
              onClick={handleSave}
              disabled={isSaving || isLoading}
              className="px-4 py-2 bg-cyan-600 text-white text-sm font-medium rounded-lg hover:bg-cyan-700 disabled:opacity-50 transition"
            >
              {isSaving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
