'use client';

import { useField } from 'formik';
import { AlertCircle, Phone } from 'lucide-react';

/** Strip +91 / 91 prefix and return just the 10-digit string.
 *  Safe to call on empty strings or numbers stored without a prefix. */
export function toPhoneDigits(phone: string): string {
  const s = (phone ?? '').trim();
  if (s.startsWith('+91')) return s.slice(3);
  // 91XXXXXXXXXX (12 chars, no +)
  if (s.startsWith('91') && s.length === 12) return s.slice(2);
  return s;
}

/** Prepend +91 to a 10-digit string. Returns '' when input is empty. */
export function withPrefix(digits: string): string {
  const d = digits.trim();
  return d ? `+91${d}` : '';
}

// ─── Shared UI ──────────────────────────────────────────────────────────────

function PhoneInputUI({
  name,
  value,
  onChange,
  onBlur,
  error,
}: {
  name?: string;
  value: string;
  onChange: (digits: string) => void;
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
  error?: string;
}) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
    onChange(digits);
  };

  return (
    <>
      <div className="flex">
        <span className="inline-flex items-center gap-1 px-3 py-2 border border-r-0 rounded-l-lg bg-slate-50 text-sm text-slate-600 border-slate-300 select-none whitespace-nowrap">
          <Phone className="w-4 h-4 text-slate-400" />
          +91
        </span>
        <input
          type="tel"
          inputMode="numeric"
          pattern="[0-9]*"
          name={name}
          value={value}
          onChange={handleChange}
          onBlur={onBlur}
          placeholder="98765 43210"
          maxLength={10}
          autoComplete="off"
          data-lpignore="true"
          data-1p-ignore="true"
          data-form-type="other"
          className={`w-full pl-3 pr-3 py-2 border rounded-r-lg text-sm focus:outline-none transition ${
            error
              ? 'border-red-400 focus:border-red-500'
              : 'border-slate-300 focus:border-cyan-500'
          }`}
        />
      </div>
      {error && (
        <p className="flex items-center gap-1 text-red-500 text-xs mt-1">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          {error}
        </p>
      )}
    </>
  );
}

// ─── Standalone (non-Formik) ─────────────────────────────────────────────────

interface PhoneInputProps {
  label: string;
  name?: string;
  value: string;
  /** Receives only the 10-digit string (no +91). */
  onChange: (digits: string) => void;
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
  required?: boolean;
  error?: string;
}

export function PhoneInput({ label, name, value, onChange, onBlur, required, error }: PhoneInputProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <PhoneInputUI name={name} value={value} onChange={onChange} onBlur={onBlur} error={error} />
    </div>
  );
}

// ─── Formik-bound ────────────────────────────────────────────────────────────

interface PhoneFieldProps {
  name: string;
  label: string;
  required?: boolean;
}

/**
 * Phone input with a fixed +91 country-code prefix.
 * Formik field stores just the 10-digit string (no prefix).
 * Use withPrefix(value) before sending to the API.
 */
export function PhoneField({ name, label, required }: PhoneFieldProps) {
  const [field, meta, helpers] = useField(name);
  const error = meta.touched && meta.error ? meta.error : undefined;

  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <PhoneInputUI
        name={field.name}
        value={field.value}
        onChange={(digits) => helpers.setValue(digits)}
        onBlur={field.onBlur}
        error={error}
      />
    </div>
  );
}
