'use client';

// Shared by the visit page (record/edit) and the patient chart (read-only):
// turning a template into inputs, and a saved encounter into text. The template
// comes from GET /specialty-encounters/templates, so neither knows any
// specialty by name.

import type {
  SpecialtyAnswer,
  SpecialtyEncounter,
  SpecialtyField,
  SpecialtyTemplate,
} from '@/lib/types';

export type Answers = SpecialtyEncounter['data'];
/** Form state: every input is held as text/array/bool and converted on submit. */
export type Draft = Record<string, Record<string, string | boolean | string[]>>;

export const inputCls =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500';

export function draftFrom(template: SpecialtyTemplate | undefined, data: Answers = {}): Draft {
  const draft: Draft = {};
  for (const section of template?.sections ?? []) {
    draft[section.key] = {};
    for (const field of section.fields) {
      const value = data[section.key]?.[field.key];
      draft[section.key][field.key] =
        value === undefined
          ? field.type === 'multiselect' ? [] : field.type === 'boolean' ? false : ''
          : field.type === 'number' ? String(value) : (value as string | boolean | string[]);
    }
  }
  return draft;
}

/** Blank answers are left out; the server drops them too, and a `false`
 *  checkbox the doctor never touched should not read as "examined: no". */
export function answersFrom(template: SpecialtyTemplate, draft: Draft, touched: Set<string>): Answers {
  const out: Answers = {};
  for (const section of template.sections) {
    for (const field of section.fields) {
      const raw = draft[section.key]?.[field.key];
      let value: SpecialtyAnswer | undefined;
      if (field.type === 'number') value = raw === '' ? undefined : Number(raw);
      else if (field.type === 'boolean') value = touched.has(`${section.key}.${field.key}`) ? Boolean(raw) : undefined;
      else if (Array.isArray(raw)) value = raw.length ? raw : undefined;
      else value = typeof raw === 'string' && raw.trim() ? raw.trim() : undefined;
      if (value !== undefined) (out[section.key] ??= {})[field.key] = value;
    }
  }
  return out;
}

export function missingRequired(template: SpecialtyTemplate, answers: Answers): string | null {
  for (const section of template.sections)
    for (const field of section.fields)
      if (field.required && answers[section.key]?.[field.key] === undefined) return `${field.label} is required`;
  return null;
}

export function touchedFrom(data: Answers = {}): Set<string> {
  return new Set(Object.entries(data).flatMap(([s, f]) => Object.keys(f).map((k) => `${s}.${k}`)));
}

export function Labelled({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-600">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

export function FieldInput({
  field,
  value,
  onChange,
}: {
  field: SpecialtyField;
  value: string | boolean | string[] | undefined;
  onChange: (value: string | boolean | string[]) => void;
}) {
  switch (field.type) {
    case 'textarea':
      return <textarea rows={2} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} className={inputCls} />;
    case 'number':
      return (
        <input
          type="number"
          min={field.min}
          max={field.max}
          step="any"
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          className={inputCls}
        />
      );
    case 'date':
      return <input type="date" value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} className={inputCls} />;
    case 'select':
      return (
        <select value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} className={inputCls}>
          <option value="">—</option>
          {field.options?.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    case 'multiselect': {
      const picked = Array.isArray(value) ? value : [];
      return (
        <div className="flex flex-wrap gap-2">
          {field.options?.map((o) => (
            <label key={o} className="flex items-center gap-1.5 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={picked.includes(o)}
                onChange={(e) => onChange(e.target.checked ? [...picked, o] : picked.filter((x) => x !== o))}
              />
              {o}
            </label>
          ))}
        </div>
      );
    }
    case 'boolean':
      return (
        <label className="flex items-center gap-2 text-sm text-slate-700 py-2">
          <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} /> Yes
        </label>
      );
    default:
      return <input value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} className={inputCls} />;
  }
}

/** A saved encounter as read-only text, section by section. */
export function EncounterAnswers({
  encounter,
  template,
}: {
  encounter: SpecialtyEncounter;
  template: SpecialtyTemplate;
}) {
  return (
    <div className="space-y-4">
      {template.sections.map((section) => {
        const answered = section.fields.filter((f) => encounter.data[section.key]?.[f.key] !== undefined);
        if (answered.length === 0) return null;
        return (
          <section key={section.key}>
            <h4 className="text-sm font-semibold text-slate-800 mb-1.5">{section.label}</h4>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {answered.map((f) => {
                const v = encounter.data[section.key][f.key];
                return (
                  <div key={f.key} className={f.type === 'textarea' ? 'col-span-2' : ''}>
                    <dt className="text-xs text-slate-500">{f.label}</dt>
                    <dd className="text-slate-900 whitespace-pre-line">
                      {typeof v === 'boolean' ? (v ? 'Yes' : 'No') : Array.isArray(v) ? v.join(', ') : String(v)}
                      {f.unit && typeof v === 'number' ? ` ${f.unit}` : ''}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </section>
        );
      })}
    </div>
  );
}
