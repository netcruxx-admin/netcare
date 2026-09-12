'use client';

import { useState } from 'react';
import { DashboardShell } from '@/components/DashboardShell';
import type { RoleViewProps } from '@/components/RoleView';
import { hasPermission } from '@/lib/auth';
import { pharmacistRole } from '@/lib/roles';
import { ConsultationBillingContent } from './ConsultationBillingContent';
import { ConsultationFeesContent } from './ConsultationFeesContent';
import { PharmacyBillingContent } from './PharmacyBillingPage';
import { InjectableLabBillingContent } from './InjectableLabBillingContent';

type Tab = 'consultation' | 'pharmacy' | 'injectableLab' | 'fees';

/**
 * One Billing screen for the whole hospital.
 *
 * Consultations and pharmacy are the same question asked at two counters —
 * "what was taken today, and what is still owed" — so they are tabs on one
 * screen rather than two menu items. The tab a role lands on is the counter it
 * works: a pharmacist opens on pharmacy, everyone else on consultations.
 *
 * The price list sits here too, behind `fees.manage`, because the person who
 * reconciles the day's takings is the one who notices a price is wrong.
 */
export function BillingPage({ session }: RoleViewProps) {
  const canManageFees = hasPermission(session, 'fees.manage');
  // Settling a bill is `payments.manage` — the same permission the endpoint
  // checks, so the button is absent rather than present-and-403ing.
  const canCollect = hasPermission(session, 'payments.manage');
  const [tab, setTab] = useState<Tab>(
    session.user.role === pharmacistRole ? 'pharmacy' : 'consultation',
  );

  const tabs: { id: Tab; label: string }[] = [
    { id: 'consultation', label: 'Consultations' },
    { id: 'pharmacy', label: 'Pharmacy' },
    { id: 'injectableLab', label: 'Injectables & Lab' },
    ...(canManageFees ? [{ id: 'fees' as Tab, label: 'Fee Schedule' }] : []),
  ];

  return (
    <DashboardShell
      role={session.user.role}
      userName={session.user.name}
      title="Billing"
      subtitle="Daily collections and billing summary"
    >
      <div className="space-y-6">
        <div className="border-b border-slate-200">
          <nav className="flex gap-1" aria-label="Billing sections">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                aria-current={tab === t.id ? 'page' : undefined}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition ${
                  tab === t.id
                    ? 'border-cyan-600 text-cyan-700'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>

        {tab === 'consultation' && <ConsultationBillingContent canCollect={canCollect} />}
        {tab === 'pharmacy' && <PharmacyBillingContent />}
        {tab === 'injectableLab' && <InjectableLabBillingContent canCollect={canCollect} />}
        {tab === 'fees' && canManageFees && <ConsultationFeesContent />}
      </div>
    </DashboardShell>
  );
}
