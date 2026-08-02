'use client';

import { useEffect, useState } from 'react';
import { Check, X, Sparkles, Building2, Layers } from 'lucide-react';
import { apiError } from '@/lib/apiError';
import {
  useCreateDepartmentMutation,
  useDeleteDepartmentMutation,
  useListDepartmentsQuery,
} from '@/store/api';
import { useActiveHospital } from '@/hooks/useActiveHospital';
import { DashboardShell } from '@/components/DashboardShell';
import type { RoleViewProps } from '@/components/RoleView';
import {
  CATEGORY_LIST,
  HOSPITAL_CATEGORIES,
  type HospitalCategoryId,
} from '@/lib/hospitalCategories';
import type { HospitalModules } from '@/lib/types';

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
  // The hospital's real category and modules — set at onboarding and changed
  // only by the platform (hospitals.manage), so this screen reports them rather
  // than pretending a hospital admin can switch them.
  const hospital = useActiveHospital();
  const activeId = hospital.category as HospitalCategoryId;
  const [selectedId, setSelectedId] = useState<HospitalCategoryId>('maternity');
  const [applyDepartments, setApplyDepartments] = useState(true);
  const [applied, setApplied] = useState('');

  useEffect(() => {
    if (hospital.category) setSelectedId(hospital.category as HospitalCategoryId);
  }, [hospital.category]);

  const { data: existingDepartments = [] } = useListDepartmentsQuery();
  const [createDepartment] = useCreateDepartmentMutation();
  const [deleteDepartment] = useDeleteDepartmentMutation();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const selected = HOSPITAL_CATEGORIES[selectedId];
  // Modules shown for the hospital's own category are the ones it actually has;
  // for any other category this is a preview of that template.
  const isActiveCategory = selectedId === activeId;

  const handleApply = async () => {
    setError('');
    setApplied('');
    setBusy(true);
    try {
      // Replace the department list with this category's template.
      for (const d of existingDepartments) {
        await deleteDepartment({ id: d.id }).unwrap();
      }
      for (const d of selected.departments) {
        await createDepartment({ name: d.name, description: d.description }).unwrap();
      }
      setApplied(`Departments replaced with the ${selected.label} template.`);
    } catch (err) {
      setError(apiError(err, 'Could not apply the department template'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <DashboardShell
      role={session.user.role}
      userName={session.user.name}
      title="Hospital Setup"
      subtitle="Your hospital type and the departments that go with it"
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
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500 to-brand-teal flex items-center justify-center">
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
              {isActiveCategory
                ? 'Features enabled for your hospital'
                : `Features a ${selected.label} hospital would get`}
            </h3>
            {!isActiveCategory && (
              <p className="text-xs text-slate-500 mb-3">
                Preview of the {selected.label} template — not your hospital&apos;s
                current plan.
              </p>
            )}
            <ul className="space-y-2">
              {MODULE_LABELS.map(({ key, label }) => {
                // Real flags for the hospital's own category; template preview
                // for any other.
                const on = isActiveCategory
                  ? Boolean(hospital.modules[key])
                  : selected.modules[key];
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

        {/* Apply bar */}
        <section className="sticky bottom-0 bg-slate-50 -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 py-4 border-t border-slate-200">
          {error && (
            <p className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
          {applied && (
            <p className="mb-3 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
              {applied}
            </p>
          )}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={applyDepartments}
                onChange={(e) => setApplyDepartments(e.target.checked)}
                className="rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
              />
              Replace my departments with the {selected.label} template
            </label>
            <button
              onClick={handleApply}
              disabled={!applyDepartments || busy}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-cyan-500 to-brand-teal text-white text-sm font-semibold px-5 py-2.5 shadow hover:opacity-95 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {busy ? 'Applying…' : 'Apply department template'}
            </button>
          </div>
          <p className="text-xs text-amber-600 mt-2">
            This deletes your current departments and recreates them from the
            template. Your hospital&apos;s category and enabled features are set by
            the platform and are not changed here.
          </p>
        </section>
      </div>
    </DashboardShell>
  );
}
