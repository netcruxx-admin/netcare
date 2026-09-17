'use client';

/**
 * The single Wards & Beds screen — a Wards tab and a Beds tab, the same
 * two-tab-in-one-route shape InventoryHub already uses for Medicines/
 * Injectables. Reachable by whoever holds beds.read (admin ships with it);
 * each panel decides for itself whether to show edit controls based on
 * wards.manage/beds.manage, the same relation Inventory's panels have to
 * medicines.manage/injectables.manage.
 */

import { useState } from 'react';
import { BedDouble, Building2 } from 'lucide-react';
import { DashboardShell } from '@/components/DashboardShell';
import type { RoleViewProps } from '@/components/RoleView';
import { WardsPanel } from '@/components/wards/WardsPanel';
import { BedsPanel } from '@/components/wards/BedsPanel';

type Section = 'wards' | 'beds';

const TABS: { id: Section; label: string; icon: typeof Building2 }[] = [
  { id: 'wards', label: 'Wards', icon: Building2 },
  { id: 'beds', label: 'Beds', icon: BedDouble },
];

export function WardsBedsHub({ session }: RoleViewProps) {
  const [section, setSection] = useState<Section>('wards');

  return (
    <DashboardShell
      role={session.user.role}
      userName={session.user.name}
      title="Wards & Beds"
      subtitle="In-patient capacity for this hospital"
    >
      <div className="space-y-6">
        <div className="border-b border-slate-200">
          <nav className="flex gap-1" aria-label="Wards & beds sections">
            {TABS.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  onClick={() => setSection(t.id)}
                  aria-current={section === t.id ? 'page' : undefined}
                  className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition ${
                    section === t.id
                      ? 'border-cyan-600 text-cyan-700'
                      : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {t.label}
                </button>
              );
            })}
          </nav>
        </div>

        {section === 'wards' && <WardsPanel session={session} />}
        {section === 'beds' && <BedsPanel session={session} />}
      </div>
    </DashboardShell>
  );
}
