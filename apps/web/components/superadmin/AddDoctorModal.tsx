'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { superadminPost } from '@/lib/superadminFetch';
import {
  useCreateUserMutation,
  useListDepartmentsQuery,
  useGetSuperadminDepartmentsPagedQuery,
} from '@/store/api';
import { PhoneInput } from '@/components/form/PhoneField';
import { apiError } from '@/lib/apiError';
import { doctorRole } from '@/lib/roles';
import type { HospitalInfo } from '@/store/api';

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  // Superadmin-only: pass hospitals to enable hospital selector
  hospitals?: HospitalInfo[];
  preselectedHospitalId?: string;
}

const EMPTY_FORM = {
  name: '', email: '', password: 'password123', phone: '',
  departmentId: '', specialization: '', qualification: '', experienceYears: '', consultationFee: '',
};

export function AddDoctorModal({ open, onClose, onSuccess, preselectedHospitalId = '', hospitals }: Props) {
  const isSuperadmin = hospitals !== undefined;
  const [hospitalId, setHospitalId] = useState(preselectedHospitalId);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [createUser] = useCreateUserMutation();

  // Admin: tenant-scoped departments. Superadmin: scoped to the selected hospital.
  const { data: adminDepts = [] } = useListDepartmentsQuery(undefined, { skip: isSuperadmin });
  const { data: superDeptsPage } = useGetSuperadminDepartmentsPagedQuery(
    { hospitalId: hospitalId || undefined, limit: 200, offset: 0 },
    { skip: !isSuperadmin },
  );
  const departments = isSuperadmin ? (superDeptsPage?.items ?? []) : adminDepts;

  if (!open) return null;

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleClose = () => {
    setForm(EMPTY_FORM);
    setError(''); setHospitalId(preselectedHospitalId); onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSuperadmin && !hospitalId) { setError('Please select a hospital'); return; }
    if (!form.name.trim() || !form.email.trim()) { setError('Name and email are required'); return; }
    setLoading(true); setError('');
    const body = {
      name: form.name.trim(), email: form.email.trim(),
      password: form.password, role: doctorRole,
      phone: form.phone.trim() ? `+91${form.phone.trim()}` : undefined,
      departmentId: form.departmentId || undefined,
      specialization: form.specialization.trim() || undefined,
      qualification: form.qualification.trim() || undefined,
      experienceYears: form.experienceYears ? Number(form.experienceYears) : undefined,
      consultationFee: form.consultationFee ? Number(form.consultationFee) : undefined,
    };
    try {
      if (isSuperadmin) {
        await superadminPost('/users', hospitalId, body);
      } else {
        await createUser(body).unwrap();
      }
      toast.success('Doctor added successfully');
      onSuccess(); handleClose();
    } catch (err) {
      setError(apiError(err, 'Failed to add doctor'));
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
          {/* Hospital selector — superadmin only */}
          {isSuperadmin && (
            preselectedHospitalId ? (
              <div className="bg-slate-50 rounded-lg px-3 py-2 text-sm text-slate-600">
                Hospital: <span className="font-medium text-slate-900">{hospitals!.find(h => h.id === preselectedHospitalId)?.name}</span>
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Hospital <span className="text-red-500">*</span></label>
                <select
                  value={hospitalId}
                  onChange={(e) => { setHospitalId(e.target.value); setForm((f) => ({ ...f, departmentId: '' })); }}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500 bg-white"
                >
                  <option value="">Select a hospital…</option>
                  {hospitals!.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
                </select>
              </div>
            )
          )}

          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Account</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Full Name <span className="text-red-500">*</span></label>
              <input value={form.name} onChange={set('name')} placeholder="Dr. Priya Mehta" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500" />
            </div>
            <div>
              <PhoneInput
                label="Phone"
                name="phone"
                value={form.phone}
                onChange={(digits) => setForm((f) => ({ ...f, phone: digits }))}
              />
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
              <label className="block text-sm font-medium text-slate-700 mb-1">Department</label>
              <select
                value={form.departmentId}
                onChange={(e) => setForm((f) => ({ ...f, departmentId: e.target.value }))}
                disabled={isSuperadmin && !hospitalId}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500 bg-white disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
              >
                <option value="">{isSuperadmin && !hospitalId ? 'Select a hospital first…' : 'Select department…'}</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Specialization</label>
              <input value={form.specialization} onChange={set('specialization')} placeholder="e.g. Interventional Cardiology" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Qualification</label>
              <input value={form.qualification} onChange={set('qualification')} placeholder="e.g. MBBS, MD" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Experience (years)</label>
              <input type="number" min="0" value={form.experienceYears} onChange={set('experienceYears')} placeholder="e.g. 10" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Consultation Fee (₹)</label>
              <input type="number" min="0" value={form.consultationFee} onChange={set('consultationFee')} placeholder="e.g. 500" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500" />
            </div>
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={handleClose} className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 text-sm font-medium transition">Cancel</button>
            <button type="submit" disabled={loading} className="flex-1 px-4 py-2.5 bg-gradient-to-r from-cyan-500 to-brand-teal text-white rounded-lg text-sm font-semibold hover:shadow-lg transition disabled:opacity-50">{loading ? 'Adding…' : 'Add Doctor'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
