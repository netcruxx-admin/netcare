'use client';

import { useState } from 'react';
import { Activity } from 'lucide-react';
import { apiError } from '@/lib/apiError';
import { authStorage, hasPermission } from '@/lib/auth';
import type { Appointment, SpecialtyEncounter, SpecialtyTemplate } from '@/lib/types';
import {
  useCreateSpecialtyEncounterMutation,
  useListDepartmentsQuery,
  useListSpecialtyEncountersPagedQuery,
  useListSpecialtyTemplatesQuery,
  useUpdateSpecialtyEncounterMutation,
} from '@/store/api';
import { Button } from '@/components/ui/button';
import {
  EncounterAnswers,
  FieldInput,
  Labelled,
  answersFrom,
  draftFrom,
  missingRequired,
  touchedFrom,
  type Draft,
} from '@/components/specialty/specialtyForm';

/**
 * The specialty part of a visit. Which form it is comes from the appointment's
 * department -- the department has a specialty, the specialty has a template --
 * so a cardiology visit shows the cardiology form and a visit in a department
 * with no form shows nothing at all.
 */
export function SpecialtyVisitSection({
  appointment,
  canManage,
}: {
  appointment: Appointment;
  /** The caller may work on this visit (its own doctor). */
  canManage: boolean;
}) {
  const [session] = useState(() => authStorage.getSession());
  const canRead = hasPermission(session, 'specialty_encounters.read');
  const canWrite = canManage && hasPermission(session, 'specialty_encounters.write');

  const { data: departments = [] } = useListDepartmentsQuery(undefined, { skip: !canRead });
  const specialty = departments.find((d) => d.id === appointment.departmentId)?.specialty ?? '';
  const { data: templates = [] } = useListSpecialtyTemplatesQuery(undefined, { skip: !canRead || !specialty });
  const template = templates.find((t) => t.id === specialty);
  const { data: page } = useListSpecialtyEncountersPagedQuery(
    { appointmentId: appointment.id, limit: 1 },
    { skip: !canRead || !template },
  );
  const existing = page?.items[0] ?? null;

  if (!canRead || !template) return null;

  // Keyed on the record so the form restarts when it is saved or reloaded.
  return (
    <SpecialtyVisitForm
      key={existing?.id ?? 'new'}
      appointmentId={appointment.id}
      template={template}
      existing={existing}
      canWrite={canWrite && (!existing || existing.doctorId === appointment.doctorId)}
    />
  );
}

function SpecialtyVisitForm({
  appointmentId,
  template,
  existing,
  canWrite,
}: {
  appointmentId: string;
  template: SpecialtyTemplate;
  existing: SpecialtyEncounter | null;
  canWrite: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => draftFrom(template, existing?.data));
  const [touched, setTouched] = useState<Set<string>>(() => touchedFrom(existing?.data));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [create] = useCreateSpecialtyEncounterMutation();
  const [update] = useUpdateSpecialtyEncounterMutation();

  const set = (section: string, field: string, value: string | boolean | string[]) => {
    setDraft((d) => ({ ...d, [section]: { ...d[section], [field]: value } }));
    setTouched((t) => new Set(t).add(`${section}.${field}`));
  };

  const save = async () => {
    const data = answersFrom(template, draft, touched);
    const missing = missingRequired(template, data);
    if (missing) return setError(missing);
    setError('');
    setSaving(true);
    try {
      if (existing) await update({ id: existing.id, data }).unwrap();
      else await create({ appointmentId, data }).unwrap();
      setEditing(false);
    } catch (err) {
      setError(apiError(err, 'Could not save the specialty record'));
    } finally {
      setSaving(false);
    }
  };

  const showForm = canWrite && (!existing || editing);

  return (
    <div className="py-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
          <Activity className="w-4 h-4 text-cyan-600" /> {template.label} record
        </h2>
        {existing && canWrite && !editing && (
          <button onClick={() => setEditing(true)} className="text-sm font-medium text-cyan-700 hover:text-cyan-800">
            Edit
          </button>
        )}
      </div>

      {showForm ? (
        <div className="space-y-5">
          {template.sections.map((section) => (
            <fieldset key={section.key} className="space-y-3">
              <legend className="text-sm font-semibold text-slate-800 mb-1">{section.label}</legend>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {section.fields.map((field) => (
                  <div
                    key={field.key}
                    className={field.type === 'textarea' || field.type === 'multiselect' ? 'sm:col-span-2' : ''}
                  >
                    <Labelled label={field.unit ? `${field.label} (${field.unit})` : field.label} required={field.required}>
                      <FieldInput
                        field={field}
                        value={draft[section.key]?.[field.key]}
                        onChange={(v) => set(section.key, field.key, v)}
                      />
                    </Labelled>
                  </div>
                ))}
              </div>
            </fieldset>
          ))}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            {existing && (
              <button
                type="button"
                onClick={() => {
                  setDraft(draftFrom(template, existing.data));
                  setTouched(touchedFrom(existing.data));
                  setError('');
                  setEditing(false);
                }}
                className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900"
              >
                Cancel
              </button>
            )}
            <Button type="button" onClick={save} disabled={saving} variant="brand">
              {saving ? 'Saving…' : existing ? 'Save changes' : `Save ${template.label.toLowerCase()} record`}
            </Button>
          </div>
        </div>
      ) : existing ? (
        <EncounterAnswers encounter={existing} template={template} />
      ) : (
        <p className="text-sm text-slate-500">No {template.label.toLowerCase()} record for this visit.</p>
      )}
    </div>
  );
}
