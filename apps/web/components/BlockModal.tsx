'use client';

import { useState } from 'react';
import { X, Ban, AlertCircle } from 'lucide-react';
import type { BlockType } from '@/lib/types';
import { apiError } from '@/lib/apiError';
import { useCreateScheduleBlockMutation } from '@/store/api';
import { BLOCK_TYPE_OPTIONS, GRID_SLOTS, slotMin } from '@/lib/schedule';

// Start options exclude the last slot; end options exclude the first (end is exclusive).
const START_SLOTS = GRID_SLOTS.slice(0, -1);
const END_SLOTS = GRID_SLOTS.slice(1);

export function BlockModal({
  doctorId,
  doctorOptions,
  defaultDate,
  onClose,
  onCreated,
}: {
  doctorId?: string;
  doctorOptions?: { value: string; label: string }[];
  defaultDate: string;
  onClose: () => void;
  onCreated: (message: string) => void;
}) {
  const [doctor, setDoctor] = useState(doctorId ?? doctorOptions?.[0]?.value ?? '');
  const [date, setDate] = useState(defaultDate);
  const [type, setType] = useState<BlockType>('break');
  const [start, setStart] = useState('09:00 AM');
  const [end, setEnd] = useState('09:30 AM');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [createScheduleBlock, { isLoading: saving }] = useCreateScheduleBlockMutation();

  const save = async () => {
    setError('');
    if (!doctor) return setError('Select a doctor');
    if (!date) return setError('Pick a date');
    if (slotMin(end) <= slotMin(start)) return setError('End time must be after start time');

    try {
      await createScheduleBlock({
        doctorId: doctor,
        date,
        startTime: start,
        endTime: end,
        type,
        note: note.trim(),
      }).unwrap();
      onCreated('Block added to schedule');
    } catch (err) {
      setError(apiError(err, 'Could not add the block'));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-lg shadow-2xl max-w-md w-full">
        <div className="flex justify-between items-center px-6 py-4 border-b">
          <div className="flex items-center gap-2">
            <Ban className="w-5 h-5 text-cyan-600" />
            <h3 className="text-lg font-bold text-slate-900">Block Time</h3>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-900"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}

          {doctorOptions && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Doctor</label>
              <select value={doctor} onChange={(e) => setDoctor(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded focus:outline-none focus:border-cyan-500">
                {doctorOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded focus:outline-none focus:border-cyan-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Type</label>
              <select value={type} onChange={(e) => setType(e.target.value as BlockType)} className="w-full px-3 py-2 border border-slate-300 rounded focus:outline-none focus:border-cyan-500">
                {BLOCK_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">From</label>
              <select value={start} onChange={(e) => setStart(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded focus:outline-none focus:border-cyan-500">
                {START_SLOTS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">To</label>
              <select value={end} onChange={(e) => setEnd(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded focus:outline-none focus:border-cyan-500">
                {END_SLOTS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Note (optional)</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Scheduled C-section" className="w-full px-3 py-2 border border-slate-300 rounded focus:outline-none focus:border-cyan-500" />
          </div>
        </div>

        <div className="flex gap-3 px-6 py-4 border-t">
          <button onClick={onClose} className="flex-1 px-4 py-2 bg-slate-200 text-slate-700 rounded hover:bg-slate-300 transition">Cancel</button>
          <button onClick={save} className="flex-1 px-4 py-2 bg-gradient-to-r from-cyan-500 to-brand-teal text-white rounded hover:shadow-lg font-semibold transition">Add Block</button>
        </div>
      </div>
    </div>
  );
}
