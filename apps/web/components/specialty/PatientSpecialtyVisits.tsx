'use client';

import { useState } from 'react';
import { Activity } from 'lucide-react';
import { authStorage, hasPermission } from '@/lib/auth';
import { useListSpecialtyEncountersPagedQuery, useListSpecialtyTemplatesQuery } from '@/store/api';
import { EncounterAnswers } from './specialtyForm';

/** A patient's specialty records, newest first, on the chart. Read-only: a
 *  record is written on its visit, by that visit's doctor. Shows nothing for a
 *  caller who cannot read them or a patient with none. */
export function PatientSpecialtyVisits({ patientId }: { patientId: string }) {
  const [session] = useState(() => authStorage.getSession());
  const canRead = hasPermission(session, 'specialty_encounters.read');
  const [open, setOpen] = useState<string | null>(null);

  const { data: page } = useListSpecialtyEncountersPagedQuery({ patientId, limit: 50 }, { skip: !canRead });
  const { data: templates = [] } = useListSpecialtyTemplatesQuery(undefined, { skip: !canRead });
  const encounters = page?.items ?? [];

  if (!canRead || encounters.length === 0) return null;

  return (
    <section className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
      <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2 mb-3">
        <Activity className="w-4 h-4 text-cyan-600" /> Specialty records
      </h2>
      <ul className="divide-y divide-slate-100">
        {encounters.map((e) => {
          const template = templates.find((t) => t.id === e.specialty);
          const isOpen = open === e.id;
          return (
            <li key={e.id} className="py-3">
              <button onClick={() => setOpen(isOpen ? null : e.id)} className="w-full text-left flex justify-between gap-3">
                <span>
                  <span className="font-medium text-slate-900">{template?.label ?? e.specialty}</span>
                  <span className="text-xs text-slate-500">
                    {' · '}{e.doctorName ? `Dr ${e.doctorName} · ` : ''}{new Date(e.createdAt).toLocaleDateString('en-IN')}
                  </span>
                  {e.data.assessment?.diagnosis && (
                    <span className="block text-sm text-slate-600">{String(e.data.assessment.diagnosis)}</span>
                  )}
                </span>
                <span className="text-xs text-cyan-700 shrink-0">{isOpen ? 'Hide' : 'View'}</span>
              </button>
              {isOpen && template && (
                <div className="mt-3">
                  <EncounterAnswers encounter={e} template={template} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
