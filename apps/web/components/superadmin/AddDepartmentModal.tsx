'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { superadminPost } from '@/lib/superadminFetch';
import type { HospitalInfo } from '@/store/api';

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  preselectedHospitalId: string;
  hospitals: HospitalInfo[];
}

export function AddDepartmentModal({ open, onClose, onSuccess, preselectedHospitalId, hospitals }: Props) {
  const [hospitalId, setHospitalId] = useState(preselectedHospitalId);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const handleClose = () => {
    setName(''); setDescription(''); setError('');
    setHospitalId(preselectedHospitalId);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hospitalId) { setError('Please select a hospital'); return; }
    if (!name.trim()) { setError('Department name is required'); return; }
    setLoading(true); setError('');
    try {
      await superadminPost('/departments', hospitalId, { name: name.trim(), description: description.trim() });
      onSuccess();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create department');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100">
          <h3 className="text-lg font-bold text-slate-900">Add Department</h3>
          <button onClick={handleClose} className="text-slate-400 hover:text-slate-900 p-1"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {!preselectedHospitalId && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Hospital <span className="text-red-500">*</span></label>
              <select value={hospitalId} onChange={(e) => setHospitalId(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500">
                <option value="">Select a hospital…</option>
                {hospitals.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
              </select>
            </div>
          )}
          {preselectedHospitalId && (
            <div className="bg-slate-50 rounded-lg px-3 py-2 text-sm text-slate-600">
              Hospital: <span className="font-medium text-slate-900">{hospitals.find(h => h.id === preselectedHospitalId)?.name}</span>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Department Name <span className="text-red-500">*</span></label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Cardiology" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Optional description" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500 resize-none" />
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={handleClose} className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 text-sm font-medium transition">Cancel</button>
            <button type="submit" disabled={loading} className="flex-1 px-4 py-2.5 bg-slate-900 text-white rounded-lg text-sm font-semibold hover:bg-slate-700 transition disabled:opacity-50">{loading ? 'Adding…' : 'Add Department'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
