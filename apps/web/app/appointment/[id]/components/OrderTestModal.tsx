'use client';

import { useMemo, useState } from 'react';
import { X, Search } from 'lucide-react';
import { apiError } from '@/lib/apiError';
import { useCreateTestOrderMutation, useListLabTestsQuery } from '@/store/api';
import { Modal } from './Modal';

interface OrderTestModalProps {
  appointmentId: string;
  patientId: string;
  doctorId: string;
  onClose: () => void;
  onSaved: (msg: string) => void;
}

export function OrderTestModal({ appointmentId, patientId, doctorId, onClose, onSaved }: OrderTestModalProps) {
  const { data: tests = [] } = useListLabTestsQuery();
  const [createTestOrder] = useCreateTestOrderMutation();
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [priority, setPriority] = useState<'routine' | 'urgent'>('routine');
  const [note, setNote] = useState('');

  const filtered = tests.filter(
    (t) => t.name.toLowerCase().includes(query.toLowerCase()) || t.category.toLowerCase().includes(query.toLowerCase()),
  );

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const total = tests.filter((t) => selected.has(t.id)).reduce((s, t) => s + t.price, 0);

  const save = async () => {
    const items = tests.filter((t) => selected.has(t.id)).map((t) => ({ testId: t.id, name: t.name, price: t.price }));
    if (items.length === 0) return;
    setError('');
    try {
      await createTestOrder({
        patientId,
        doctorId,
        appointmentId,
        items,
        status: 'ordered',
        priority,
        clinicalNote: note.trim(),
      }).unwrap();
      onSaved(`Ordered ${items.length} test${items.length === 1 ? '' : 's'}`);
    } catch (err) {
      setError(apiError(err, 'Could not place the order'));
    }
  };

  return (
    <Modal maxWidth="max-w-lg" scroll>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-slate-900">Order Lab Tests</h2>
        <button onClick={onClose} className="text-slate-500 hover:text-slate-900">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-3">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search tests…"
          className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500"
        />
      </div>

      {/* Test list */}
      <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
        {filtered.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-6">No tests found.</p>
        ) : (
          filtered.map((t) => (
            <label key={t.id} className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 cursor-pointer">
              <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggle(t.id)} className="rounded border-slate-300 text-cyan-600 focus:ring-cyan-500" />
              <span className="flex-1 min-w-0">
                <span className="block text-sm text-slate-800 truncate">{t.name}</span>
                <span className="block text-xs text-slate-400">{t.category} · {t.turnaroundTime}</span>
              </span>
              <span className="text-sm text-slate-600 shrink-0">₹{t.price}</span>
            </label>
          ))
        )}
      </div>

      {/* Priority + note */}
      <div className="grid sm:grid-cols-2 gap-3 mt-4">
        <label className="block">
          <span className="text-xs font-medium text-slate-600">Priority</span>
          <select value={priority} onChange={(e) => setPriority(e.target.value as 'routine' | 'urgent')} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500">
            <option value="routine">Routine</option>
            <option value="urgent">Urgent</option>
          </select>
        </label>
        <div className="flex items-end justify-end">
          <p className="text-sm text-slate-600">{selected.size} selected · <span className="font-semibold text-slate-900">₹{total}</span></p>
        </div>
      </div>
      <label className="block mt-3">
        <span className="text-xs font-medium text-slate-600">Clinical note</span>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Reason / clinical context" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500" />
      </label>
      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{error}</p>
      )}

      <div className="flex gap-3 pt-4">
        <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition">
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={selected.size === 0}
          className="flex-1 px-4 py-2 bg-gradient-to-r from-cyan-500 to-teal-600 text-white rounded-lg hover:shadow-lg font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Order {selected.size > 0 ? `(${selected.size})` : ''}
        </button>
      </div>
    </Modal>
  );
}
