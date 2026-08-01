'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, X, Sparkles, Building2, Layers, Database, Trash2 } from 'lucide-react';
// The demo-data helpers below are still backed by the local mock store; the
// department template is applied through the real API.
import { dbOperations } from '@/lib/db';
import { apiError } from '@/lib/apiError';
import {
  useCreateDepartmentMutation,
  useDeleteDepartmentMutation,
  useListDepartmentsQuery,
} from '@/store/api';
import { DashboardShell } from '@/components/DashboardShell';
import type { RoleViewProps } from '@/components/RoleView';
import {
  CATEGORY_LIST,
  HOSPITAL_CATEGORIES,
  getActiveCategoryId,
  setActiveCategory,
  type HospitalCategoryId,
} from '@/lib/hospitalCategories';
import type { HospitalModules } from '@/lib/hospitalConfig';

// Human labels for the module flags, in display order.
const MODULE_LABELS: { key: keyof HospitalModules; label: string }[] = [
  { key: 'medicalRecords', label: 'Medical Records' },
  { key: 'lab', label: 'Lab & Diagnostics' },
  { key: 'pharmacy', label: 'Pharmacy' },
  { key: 'nursing', label: 'Nursing Station' },
  { key: 'payments', label: 'Billing & Payments' },
  { key: 'telemedicine', label: 'Telemedicine' },
  { key: 'anc', label: 'Pregnancy (ANC) Tracker' },
];

export function AdminSetup({ session }: RoleViewProps) {
  const router = useRouter();
  const [activeId, setActiveId] = useState<HospitalCategoryId>('maternity');
  const [selectedId, setSelectedId] = useState<HospitalCategoryId>('maternity');
  const [applyDepartments, setApplyDepartments] = useState(true);
  const [dataMsg, setDataMsg] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    const current = getActiveCategoryId();
    setActiveId(current);
    setSelectedId(current);
  }, [session]);

  const { data: existingDepartments = [] } = useListDepartmentsQuery();
  const [createDepartment] = useCreateDepartmentMutation();
  const [deleteDepartment] = useDeleteDepartmentMutation();
  const [error, setError] = useState('');

  const selected = HOSPITAL_CATEGORIES[selectedId];
  const isDirty = selectedId !== activeId;

  const handleApply = async () => {
    setActiveCategory(selectedId);

    if (applyDepartments) {
      // Replace the department list with this category's template.
      setError('');
      try {
        for (const d of existingDepartments) {
          await deleteDepartment(d.id).unwrap();
        }
        for (const d of selected.departments) {
          await createDepartment({ name: d.name, description: d.description }).unwrap();
        }
      } catch (err) {
        setError(apiError(err, 'Could not apply the department template'));
        return;
      }
    }

    // Full reload so every screen re-reads the active category / modules.
    window.location.reload();
  };

  const loadDemo = () => {
    dbOperations.loadMaternityDemo();
    setDataMsg('Sample maternity data loaded — explore the patient, doctor and admin dashboards.');
    setTimeout(() => setDataMsg(''), 4000);
  };

  const clearData = () => {
    dbOperations.clearOperationalData();
    setConfirmClear(false);
    setDataMsg('All operational data cleared. The app is back to a clean slate.');
    setTimeout(() => setDataMsg(''), 4000);
  };

  return (
    <DashboardShell
      role={session.user.role}
      userName={session.user.name}
      title="Hospital Setup"
      subtitle="Choose your hospital type — it decides which features are enabled"
    >
      <div className="space-y-6">
        {/* Category picker */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Layers className="w-5 h-5 text-cyan-600" />
            <h2 className="text-base font-semibold text-slate-900">Hospital Category</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {CATEGORY_LIST.map((cat) => {
              const Icon = cat.icon;
              const isSelected = cat.id === selectedId;
              const isCurrent = cat.id === activeId;
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedId(cat.id)}
                  className={`text-left rounded-xl border p-4 transition ${
                    isSelected
                      ? 'border-cyan-500 ring-2 ring-cyan-500/20 bg-cyan-50/50'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500 to-teal-600 flex items-center justify-center">
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                    {isCurrent && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-cyan-700 bg-cyan-100 px-2 py-0.5 rounded-full">
                        Active
                      </span>
                    )}
                  </div>
                  <p className="mt-3 font-semibold text-slate-900">{cat.label}</p>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">{cat.description}</p>
                </button>
              );
            })}
          </div>
        </section>

        {/* Selected category detail */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Modules */}
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">
              Features enabled for a {selected.label} hospital
            </h3>
            <ul className="space-y-2">
              {MODULE_LABELS.map(({ key, label }) => {
                const on = selected.modules[key];
                return (
                  <li key={key} className="flex items-center gap-2 text-sm">
                    <span
                      className={`w-5 h-5 rounded-full flex items-center justify-center ${
                        on ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-400'
                      }`}
                    >
                      {on ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                    </span>
                    <span className={on ? 'text-slate-900' : 'text-slate-400 line-through'}>{label}</span>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Signature features */}
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-4 h-4 text-amber-500" />
              <h3 className="text-sm font-semibold text-slate-900">Signature features</h3>
            </div>
            <ul className="space-y-3">
              {selected.signatureFeatures.map((f) => (
                <li key={f.label} className="text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-900">{f.label}</span>
                    {!f.built && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                        Coming soon
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{f.description}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Suggested departments & specializations */}
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-2 mb-3">
            <Building2 className="w-4 h-4 text-cyan-600" />
            <h3 className="text-sm font-semibold text-slate-900">Suggested departments & specializations</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-medium text-slate-500 mb-2">Departments</p>
              <ul className="space-y-1">
                {selected.departments.map((d) => (
                  <li key={d.id} className="text-sm text-slate-700">
                    • {d.name}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 mb-2">Specializations</p>
              <div className="flex flex-wrap gap-1.5">
                {selected.specializations.map((s) => (
                  <span key={s} className="text-xs bg-slate-100 text-slate-700 px-2 py-1 rounded-md">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Demo data */}
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-2 mb-1">
            <Database className="w-4 h-4 text-cyan-600" />
            <h3 className="text-sm font-semibold text-slate-900">Demo data</h3>
          </div>
          <p className="text-xs text-slate-500 mb-4">
            Populate the app with a realistic maternity scenario for demos &amp; pitches — patients at
            different pregnancy stages, antenatal visits, appointments, lab results and payments. The
            app ships empty by default; you can clear this any time.
          </p>
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}
          {dataMsg && (
            <div className="mb-3 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
              {dataMsg}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={loadDemo}
              className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-cyan-500 to-teal-600 text-white text-sm font-semibold px-4 py-2 shadow hover:opacity-95"
            >
              <Sparkles className="w-4 h-4" /> Load sample maternity data
            </button>
            {confirmClear ? (
              <div className="inline-flex items-center gap-2">
                <span className="text-sm text-slate-600">Clear everything?</span>
                <button onClick={clearData} className="text-sm font-semibold text-red-600 hover:text-red-700 px-2 py-1">
                  Yes, clear
                </button>
                <button onClick={() => setConfirmClear(false)} className="text-sm text-slate-500 hover:text-slate-700 px-2 py-1">
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmClear(true)}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 text-slate-600 text-sm font-medium px-4 py-2 hover:bg-slate-50"
              >
                <Trash2 className="w-4 h-4" /> Clear all data
              </button>
            )}
          </div>
        </section>

        {/* Apply bar */}
        <section className="sticky bottom-0 bg-slate-50 -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 py-4 border-t border-slate-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={applyDepartments}
                onChange={(e) => setApplyDepartments(e.target.checked)}
                className="rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
              />
              Also replace departments with this category&apos;s template
            </label>
            <button
              onClick={handleApply}
              disabled={!isDirty && !applyDepartments}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-cyan-500 to-teal-600 text-white text-sm font-semibold px-5 py-2.5 shadow hover:opacity-95 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isDirty ? `Switch to ${selected.label}` : 'Re-apply category'}
            </button>
          </div>
          {isDirty && (
            <p className="text-xs text-amber-600 mt-2">
              Switching will change which features and menu items are visible across the app.
            </p>
          )}
        </section>
      </div>
    </DashboardShell>
  );
}
