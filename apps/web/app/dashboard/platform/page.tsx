'use client';

// -----------------------------------------------------------------------------
// Platform onboarding — create a new tenant (hospital) at runtime.
//
// Picks a vertical category (which supplies modules / departments /
// specializations), captures branding, persists the config to localStorage as a
// custom tenant, registers its subdomain, and seeds it into the store. The new
// hospital is then reachable via its subdomain or the in-app switcher.
// -----------------------------------------------------------------------------

import { useState } from 'react';
import Link from 'next/link';
import { Building2, ArrowLeft, CheckCircle } from 'lucide-react';

import { CATEGORY_LIST, HOSPITAL_CATEGORIES, type HospitalCategoryId } from '@/lib/hospitalCategories';
import { getAllHospitals, saveCustomHospital, type HospitalConfig } from '@/lib/hospitalConfig';
import { dbOperations } from '@/lib/db';
import { registerTenantSubdomains, setCurrentHospitalId } from '@/lib/tenant';

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export default function PlatformOnboardingPage() {
  const [name, setName] = useState('');
  const [subdomain, setSubdomain] = useState('');
  const [category, setCategory] = useState<HospitalCategoryId>('multi-specialty');
  const [primary, setPrimary] = useState('#0891b2');
  const [primaryDark, setPrimaryDark] = useState('#0d9488');
  const [created, setCreated] = useState<HospitalConfig | null>(null);
  const [error, setError] = useState('');

  const cat = HOSPITAL_CATEGORIES[category];
  const effectiveSubdomain = subdomain || slugify(name);

  const handleCreate = () => {
    setError('');
    if (!name.trim()) return setError('Hospital name is required.');
    const sub = effectiveSubdomain;
    if (!sub) return setError('A subdomain is required.');
    const taken = getAllHospitals().some((h) => h.subdomain === sub);
    if (taken) return setError(`Subdomain "${sub}" is already in use.`);

    const cfg: HospitalConfig = {
      id: `hosp-${Date.now()}`,
      subdomain: sub,
      name: name.trim(),
      tagline: cat.tagline,
      type: category,
      currency: 'INR',
      theme: { primary, primaryDark },
      modules: cat.modules,
      specializations: cat.specializations,
      // Catalog seeded from the category's department template; medicines/lab
      // tests start empty and are added by the hospital's admin.
      departments: cat.departments,
      medicines: [],
      labTests: [],
    };

    saveCustomHospital(cfg);
    registerTenantSubdomains({ [cfg.subdomain]: cfg.id });
    dbOperations.ensureTenantSeeded(cfg.id);
    setCreated(cfg);
  };

  const goToHospital = () => {
    if (!created) return;
    setCurrentHospitalId(created.id);
    window.location.href = '/login';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 p-6">
      <div className="max-w-2xl mx-auto">
        <Link href="/dashboard/admin" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 mb-6">
          <ArrowLeft className="w-4 h-4" /> Back to admin
        </Link>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-11 h-11 rounded-xl bg-slate-900 flex items-center justify-center">
            <Building2 className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Onboard a Hospital</h1>
            <p className="text-sm text-slate-500">Create a new tenant on the platform.</p>
          </div>
        </div>

        {created ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <div className="flex items-center gap-2 text-emerald-600 mb-3">
              <CheckCircle className="w-5 h-5" />
              <span className="font-semibold">{created.name} created</span>
            </div>
            <p className="text-sm text-slate-600 mb-1">
              Tenant id: <code className="bg-slate-100 px-1.5 py-0.5 rounded">{created.id}</code>
            </p>
            <p className="text-sm text-slate-600 mb-4">
              Reachable at <code className="bg-slate-100 px-1.5 py-0.5 rounded">{created.subdomain}.localhost:3000</code>{' '}
              (or via the in-app hospital switcher). Demo logins: <code>admin@example.com</code> / <code>password123</code>.
            </p>
            <div className="flex gap-3">
              <button onClick={goToHospital} className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800">
                Go to {created.name}
              </button>
              <button onClick={() => { setCreated(null); setName(''); setSubdomain(''); }} className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Create another
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Hospital name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Aster Eye Care"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Subdomain</label>
              <div className="flex items-center gap-2">
                <input
                  value={effectiveSubdomain}
                  onChange={(e) => setSubdomain(slugify(e.target.value))}
                  placeholder="aster"
                  className="w-40 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                />
                <span className="text-sm text-slate-400">.localhost:3000</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Category (vertical)</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as HospitalCategoryId)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-300"
              >
                {CATEGORY_LIST.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
              <p className="text-xs text-slate-500 mt-1">{cat.description}</p>
            </div>

            <div className="flex gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Primary colour</label>
                <input type="color" value={primary} onChange={(e) => setPrimary(e.target.value)} className="h-9 w-16 rounded border border-slate-200" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Accent colour</label>
                <input type="color" value={primaryDark} onChange={(e) => setPrimaryDark(e.target.value)} className="h-9 w-16 rounded border border-slate-200" />
              </div>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button onClick={handleCreate} className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800">
              Create hospital
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
