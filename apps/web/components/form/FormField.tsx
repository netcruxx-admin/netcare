'use client';

import { useState } from 'react';
import { useField } from 'formik';
import { AlertCircle, Eye, EyeOff } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

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
}: FormFieldProps) {
  const [field, meta] = useField(name);
  const onChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    field.onChange(e);
    onValueChange?.(e.target.value);
  };
  const [show, setShow] = useState(false);
  const hasError = meta.touched && !!meta.error;
  const isPassword = type === 'password';
  const left = Icon ? 'pl-10' : 'pl-3';
  const right = isPassword ? 'pr-10' : 'pr-3';
  const base = `w-full ${left} ${right} py-2 border rounded-lg text-sm focus:outline-none transition ${
    hasError ? 'border-red-400 focus:border-red-500' : 'border-slate-300 focus:border-cyan-500'
  }`;

  let control;
  if (as === 'textarea') {
    control = <textarea {...field} onChange={onChange} placeholder={placeholder} rows={rows} className={`${base} resize-none`} />;
  } else if (as === 'select') {
    control = (
      <select {...field} onChange={onChange} className={base}>
        <option value="">{placeholder ?? 'Select…'}</option>
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

  const needsWrapper = !!Icon || isPassword;

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
