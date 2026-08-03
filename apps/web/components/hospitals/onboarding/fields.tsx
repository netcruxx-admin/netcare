'use client';

// Small Formik-bound controls the wizard needs and components/form/FormField
// does not cover: a checkbox, a chip multi-select, and a number input that
// keeps "" distinct from 0. FormField handles text, textarea and select, and is
// used directly everywhere those fit.

import { useField } from 'formik';
import { AlertCircle, Check } from 'lucide-react';

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
      {children}
    </p>
  );
}

export function FieldGrid({
  cols = 2,
  children,
}: {
  cols?: 2 | 3 | 4;
  children: React.ReactNode;
}) {
  const map = { 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3', 4: 'sm:grid-cols-4' };
  return <div className={`grid grid-cols-1 ${map[cols]} gap-4`}>{children}</div>;
}

export function NumberField({
  name,
  label,
  placeholder,
  min = 0,
  hint,
}: {
  name: string;
  label: string;
  placeholder?: string;
  min?: number;
  hint?: string;
}) {
  const [field, meta, helpers] = useField<number | ''>(name);
  const hasError = meta.touched && !!meta.error;
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      <input
        type="number"
        min={min}
        value={field.value === '' || field.value === null ? '' : field.value}
        onChange={(e) =>
          // An empty box means "not answered" and must not collapse to 0 — the
          // API reads undefined as "use the default" and 0 as a real answer.
          helpers.setValue(e.target.value === '' ? '' : Number(e.target.value))
        }
        onBlur={() => helpers.setTouched(true)}
        placeholder={placeholder}
        className={`w-full px-3 py-2 border rounded focus:outline-none transition ${
          hasError ? 'border-red-400 focus:border-red-500' : 'border-slate-300 focus:border-cyan-500'
        }`}
      />
      {hasError ? (
        <p className="flex items-center gap-1 text-red-500 text-xs mt-1">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          {meta.error}
        </p>
      ) : hint ? (
        <p className="text-xs text-slate-400 mt-1">{hint}</p>
      ) : null}
    </div>
  );
}

export function CheckboxField({
  name,
  label,
  description,
}: {
  name: string;
  label: string;
  description?: string;
}) {
  const [field, , helpers] = useField<boolean>(name);
  return (
    <button
      type="button"
      onClick={() => helpers.setValue(!field.value)}
      className={`flex items-start gap-3 text-left px-3 py-2.5 rounded-lg border transition ${
        field.value
          ? 'border-cyan-500 bg-cyan-50/60'
          : 'border-slate-200 hover:border-slate-300 bg-white'
      }`}
    >
      <span
        className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
          field.value ? 'bg-cyan-500 border-cyan-500' : 'border-slate-300 bg-white'
        }`}
      >
        {field.value && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-slate-800">{label}</span>
        {description && <span className="block text-xs text-slate-500">{description}</span>}
      </span>
    </button>
  );
}

/** Chip multi-select for specialties. A free-text box would produce "Cardiology",
 *  "cardiology" and "Cardio" in the same hospital, which nothing can group by. */
export function ChipMultiSelect({
  name,
  label,
  options,
  allowCustom = true,
}: {
  name: string;
  label: string;
  options: string[];
  allowCustom?: boolean;
}) {
  const [field, , helpers] = useField<string[]>(name);
  const selected = field.value ?? [];
  const extras = selected.filter((s) => !options.includes(s));

  const toggle = (value: string) =>
    helpers.setValue(
      selected.includes(value) ? selected.filter((s) => s !== value) : [...selected, value],
    );

  const addCustom = (raw: string) => {
    const value = raw.trim();
    if (value && !selected.includes(value)) helpers.setValue([...selected, value]);
  };

  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-2">{label}</label>
      <div className="flex flex-wrap gap-2">
        {[...options, ...extras].map((option) => {
          const on = selected.includes(option);
          return (
            <button
              key={option}
              type="button"
              onClick={() => toggle(option)}
              className={`px-3 py-1.5 rounded-full text-sm border transition ${
                on
                  ? 'bg-cyan-500 border-cyan-500 text-white'
                  : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
              }`}
            >
              {option}
            </button>
          );
        })}
      </div>
      {allowCustom && (
        <input
          type="text"
          placeholder="Add another specialty and press Enter"
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            addCustom(e.currentTarget.value);
            e.currentTarget.value = '';
          }}
          className="mt-3 w-full px-3 py-2 border border-slate-300 rounded text-sm focus:outline-none focus:border-cyan-500"
        />
      )}
    </div>
  );
}

export function ColourField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      <div className="flex items-center gap-2 h-9">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-12 rounded border border-slate-300 cursor-pointer"
        />
        <span className="text-xs font-mono text-slate-500">{value}</span>
      </div>
    </div>
  );
}

/** A read-only row on the review step. Renders a dash rather than nothing for
 *  a blank value, so a skipped field is visibly skipped. */
export function ReviewRow({ label, value }: { label: string; value?: string | number | null }) {
  const shown = value === '' || value === null || value === undefined ? '—' : String(value);
  return (
    <div className="flex justify-between gap-4 py-1.5 border-b border-slate-50 last:border-0">
      <span className="text-sm text-slate-500 shrink-0">{label}</span>
      <span
        className={`text-sm text-right ${shown === '—' ? 'text-slate-300' : 'text-slate-800 font-medium'}`}
      >
        {shown}
      </span>
    </div>
  );
}
