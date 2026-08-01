'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { superadminPost } from '@/lib/superadminFetch';
import { doctorRole } from '@/lib/roles';
import type { HospitalInfo } from '@/store/api';

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  preselectedHospitalId: string;
  hospitals: HospitalInfo[];
}

export function AddDoctorModal({ open, onClose, onSuccess, preselectedHospitalId, hospitals }: Props) {
  const [hospitalId, setHospitalId] = useState(preselectedHospitalId);
  const [form, setForm] = useState({
    name: '', email: '', password: 'password123', phone: '',
    specialization: '', qualification: '', experienceYears: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleClose = () => {
    setForm({ name: '', email: '', password: 'password123', phone: '', specialization: '', qualification: '', experienceYears: '' });
    setError(''); setHospitalId(preselectedHospitalId); onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hospitalId) { setError('Please select a hospital'); return; }
    if (!form.name.trim() || !form.email.trim()) { setError('Name and email are required'); return; }
    setLoading(true); setError('');
    try {
      // POST /users accepts any non-platform role and creates the doctor profile alongside
      await superadminPost('/users', hospitalId, {
        name: form.name.trim(), email: form.email.trim(),
        password: form.password, role: doctorRole,
        phone: form.phone.trim() || undefined,
        specialization: form.specialization.trim() || undefined,
        qualification: form.qualification.trim() || undefined,
        experienceYears: form.experienceYears ? Number(form.experienceYears) : undefined,
      });
      toast.success('Doctor added successfully');
      onSuccess(); handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add doctor');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg my-8">
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100">
          <h3 className="text-lg font-bold text-slate-900">Add Doctor</h3>
          <button onClick={handleClose} className="text-slate-400 hover:text-slate-900 p-1"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {!preselectedHospitalId ? (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Hospital <span className="text-red-500">*</span></label>
              <select value={hospitalId} onChange={(e) => setHospitalId(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500">
                <option value="">Select a hospital…</option>
                {hospitals.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
              </select>
            </div>
          ) : (
            <div className="bg-slate-50 rounded-lg px-3 py-2 text-sm text-slate-600">
              Hospital: <span className="font-medium text-slate-900">{hospitals.find(h => h.id === preselectedHospitalId)?.name}</span>
            </div>
          )}

          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Account</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Full Name <span className="text-red-500">*</span></label>
              <input value={form.name} onChange={set('name')} placeholder="Dr. Priya Mehta" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
              <input value={form.phone} onChange={set('phone')} placeholder="+91 98765 43210" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email <span className="text-red-500">*</span></label>
              <input type="email" value={form.email} onChange={set('email')} placeholder="doctor@hospital.com" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
              <input type="password" value={form.password} onChange={set('password')} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500" />
            </div>
          </div>

          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide pt-1">Professional Details</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Specialization</label>
              <input value={form.specialization} onChange={set('specialization')} placeholder="e.g. Cardiology" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Qualification</label>
              <input value={form.qualification} onChange={set('qualification')} placeholder="e.g. MBBS, MD" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Experience (years)</label>
              <input type="number" min="0" value={form.experienceYears} onChange={set('experienceYears')} placeholder="e.g. 10" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500" />
            </div>
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={handleClose} className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 text-sm font-medium transition">Cancel</button>
            <button type="submit" disabled={loading} className="flex-1 px-4 py-2.5 bg-slate-900 text-white rounded-lg text-sm font-semibold hover:bg-slate-700 transition disabled:opacity-50">{loading ? 'Adding…' : 'Add Doctor'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
