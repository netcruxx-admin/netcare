'use client';

import { useState } from 'react';
import { useField } from 'formik';
import { AlertCircle, Eye, EyeOff } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { DictationButton } from './DictationButton';

interface Option {
  value: string;
  label: string;
}

interface FormFieldProps {
  name: string;
  label: string;
  as?: 'input' | 'textarea' | 'select';
  type?: string;
  placeholder?: string;
  options?: Option[];
  autoFocus?: boolean;
  rows?: number;
  min?: string;
  max?: string;
  required?: boolean;
  /** Optional leading icon rendered inside the control. */
  icon?: LucideIcon;
  /** Native autocomplete hint. Defaults to "off" to suppress manager popups. */
  autoComplete?: string;
  /**
   * Notified after Formik records the change. For the cases where something
   * outside the form — a query hook, say — has to react to a field's value.
   */
  onValueChange?: (value: string) => void;
  /**
   * Show a mic button that appends dictated speech to the field. Only for
   * free-text `input`/`textarea` fields; silently absent where the browser has
   * no speech recognition.
   */
  dictation?: boolean;
}

export function FormField({
  name,
  label,
  as = 'input',
  type = 'text',
  placeholder,
  options,
  autoFocus,
  rows = 3,
  min,
  max,
  required,
  icon: Icon,
  autoComplete,
  onValueChange,
  dictation = false,
}: FormFieldProps) {
  const [field, meta, helpers] = useField(name);
  const onChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    // Matching lower() on every read (login, uniqueness checks) is what makes
    // email matching case-insensitive; lowering it here too is just so what
    // the person sees on screen is what will actually be compared, rather
    // than only silently rewritten once the form hits the API.
    if (type === 'email') {
      const next = e.target.value.toLowerCase();
      helpers.setValue(next);
      onValueChange?.(next);
      return;
    }
    field.onChange(e);
    onValueChange?.(e.target.value);
  };
  const canDictate = dictation && as !== 'select' && type !== 'password';
  const appendDictation = (text: string) => {
    const current: string = field.value ?? '';
    const next = !current || /\s$/.test(current) ? `${current}${text}` : `${current} ${text}`;
    helpers.setValue(next);
    helpers.setTouched(true);
    onValueChange?.(next);
  };
  const [show, setShow] = useState(false);
  const hasError = meta.touched && !!meta.error;
  const isPassword = type === 'password';
  const left = Icon ? 'pl-10' : 'pl-3';
  const right = isPassword || canDictate ? 'pr-10' : 'pr-3';
  const base = `w-full ${left} ${right} py-2 border rounded-lg text-sm focus:outline-none transition ${
    hasError ? 'border-red-400 focus:border-red-500' : 'border-slate-300 focus:border-cyan-500'
  }`;

  let control;
  if (as === 'textarea') {
    control = <textarea {...field} onChange={onChange} placeholder={placeholder} rows={rows} className={`${base} resize-none`} />;
  } else if (as === 'select') {
    control = (
      <select {...field} onChange={onChange} className={base}>
        {/* A real placeholder: it shows while the field is empty, but
            `disabled` + `hidden` keep it out of the list so it can never be
            picked back as a value. A select that needs an explicit
            "None"/"Any" choice should carry it in `options`. */}
        <option value="" disabled hidden>
          {placeholder ?? 'Select…'}
        </option>
        {options?.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  } else {
    control = (
      <input
        {...field}
        onChange={onChange}
        type={isPassword && show ? 'text' : type}
        placeholder={placeholder}
        autoFocus={autoFocus}
        min={min}
        max={max}
        autoComplete={autoComplete ?? 'off'}
        data-lpignore="true"
        data-1p-ignore="true"
        data-form-type="other"
        className={base}
      />
    );
  }

  const needsWrapper = !!Icon || isPassword || canDictate;

  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {needsWrapper ? (
        <div className="relative">
          {Icon && <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />}
          {control}
          {canDictate && (
            <DictationButton
              onTranscript={appendDictation}
              label={`Dictate ${label.toLowerCase()}`}
              className={as === 'textarea' ? 'absolute right-2 top-2' : 'absolute right-2 top-1/2 -translate-y-1/2'}
            />
          )}
          {isPassword && (
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              aria-label={show ? 'Hide password' : 'Show password'}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
            >
              {show ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          )}
        </div>
      ) : (
        control
      )}
      {hasError && (
        <p className="flex items-center gap-1 text-red-500 text-xs mt-1">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          {meta.error}
        </p>
      )}
    </div>
  );
}
