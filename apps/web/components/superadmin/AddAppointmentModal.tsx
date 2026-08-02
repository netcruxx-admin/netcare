'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { superadminPost, superadminGet } from '@/lib/superadminFetch';
import type { HospitalInfo } from '@/store/api';
import type { Patient, Doctor, Department } from '@/lib/types';

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  preselectedHospitalId: string;
  hospitals: HospitalInfo[];
}

export function AddAppointmentModal({ open, onClose, onSuccess, preselectedHospitalId, hospitals }: Props) {
  const [hospitalId, setHospitalId] = useState(preselectedHospitalId);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);

  const [form, setForm] = useState({
    patientId: '', doctorId: '', departmentId: '',
    date: '', time: '', reason: '', mode: 'in-person',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Load patients / doctors / departments whenever the hospital changes
  useEffect(() => {
    if (!hospitalId || !open) return;
    setLoadingOptions(true);
    setPatients([]); setDoctors([]); setDepartments([]);
    setForm((f) => ({ ...f, patientId: '', doctorId: '', departmentId: '' }));

    Promise.all([
      superadminGet<Patient[]>('/patients', hospitalId),
      superadminGet<Doctor[]>('/doctors', hospitalId),
      superadminGet<Department[]>('/departments', hospitalId),
    ])
      .then(([p, d, dep]) => { setPatients(p); setDoctors(d); setDepartments(dep); })
      .catch(() => {/* silent — dropdowns stay empty */})
      .finally(() => setLoadingOptions(false));
  }, [hospitalId, open]);

  if (!open) return null;

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleClose = () => {
    setForm({ patientId: '', doctorId: '', departmentId: '', date: '', time: '', reason: '', mode: 'in-person' });
    setError(''); setHospitalId(preselectedHospitalId);
    setPatients([]); setDoctors([]); setDepartments([]);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hospitalId) { setError('Please select a hospital'); return; }
    if (!form.patientId || !form.doctorId || !form.departmentId || !form.date || !form.time) {
      setError('Patient, doctor, department, date and time are required'); return;
    }
    setLoading(true); setError('');
    try {
      await superadminPost('/appointments', hospitalId, {
        patientId: form.patientId, doctorId: form.doctorId,
        departmentId: form.departmentId, date: form.date,
        time: form.time, reason: form.reason.trim(),
        mode: form.mode, status: 'scheduled',
      });
      onSuccess(); handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create appointment');
    } finally {
      setLoading(false);
    }
  };

  // Helper to get patient display name (needs user lookup — use userId as fallback)
  const patientLabel = (p: Patient) => p.user?.name ?? p.userId;
  const doctorLabel = (d: Doctor) => d.user?.name ?? d.userId;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg my-8">
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100">
          <h3 className="text-lg font-bold text-slate-900">Add Appointment</h3>
          <button onClick={handleClose} className="text-slate-400 hover:text-slate-900 p-1"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* Hospital picker */}
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

          {/* Patient / Doctor / Dept — disabled until hospital is chosen */}
          <fieldset disabled={!hospitalId} className="space-y-4">
            {loadingOptions && (
              <p className="text-xs text-slate-400 text-center">Loading options…</p>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Patient <span className="text-red-500">*</span></label>
                <select value={form.patientId} onChange={set('patientId')} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500 disabled:bg-slate-50 disabled:text-slate-400">
                  <option value="">{patients.length ? 'Select patient…' : 'No patients yet'}</option>
                  {patients.map((p) => <option key={p.id} value={p.id}>{patientLabel(p)}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Doctor <span className="text-red-500">*</span></label>
                <select value={form.doctorId} onChange={set('doctorId')} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500 disabled:bg-slate-50 disabled:text-slate-400">
                  <option value="">{doctors.length ? 'Select doctor…' : 'No doctors yet'}</option>
                  {doctors.map((d) => <option key={d.id} value={d.id}>{doctorLabel(d)}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Department <span className="text-red-500">*</span></label>
                <select value={form.departmentId} onChange={set('departmentId')} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500 disabled:bg-slate-50 disabled:text-slate-400">
                  <option value="">{departments.length ? 'Select dept…' : 'No departments yet'}</option>
                  {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Mode</label>
                <select value={form.mode} onChange={set('mode')} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500">
                  <option value="in-person">In-Person</option>
                  <option value="video">Video</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Date <span className="text-red-500">*</span></label>
                <input type="date" value={form.date} onChange={set('date')} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500 disabled:bg-slate-50" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Time <span className="text-red-500">*</span></label>
                <input type="time" value={form.time} onChange={set('time')} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500 disabled:bg-slate-50" />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">Reason</label>
                <input value={form.reason} onChange={set('reason')} placeholder="e.g. Routine checkup" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500 disabled:bg-slate-50" />
              </div>
            </div>
          </fieldset>

          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={handleClose} className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 text-sm font-medium transition">Cancel</button>
            <button type="submit" disabled={loading || !hospitalId} className="flex-1 px-4 py-2.5 bg-gradient-to-r from-cyan-500 to-brand-teal text-white rounded-lg text-sm font-semibold hover:shadow-lg transition disabled:opacity-50">{loading ? 'Booking…' : 'Book Appointment'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
