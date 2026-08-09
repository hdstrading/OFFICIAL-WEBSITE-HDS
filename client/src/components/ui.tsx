import React from 'react';
import { AlertCircle, Check, Loader2, Star } from 'lucide-react';

/**
 * Shared building blocks. Everything the customer touches is built from these,
 * so focus rings, spacing and error styling stay consistent across the site.
 */

/* -------------------------------------------------------------------- button */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-cyan-700 text-white hover:bg-cyan-800 focus-visible:outline-cyan-700 shadow-sm',
  secondary:
    'bg-white text-slate-800 border border-slate-300 hover:bg-slate-50 hover:border-slate-400 focus-visible:outline-slate-500',
  ghost: 'bg-transparent text-slate-700 hover:bg-slate-100 focus-visible:outline-slate-400',
  danger: 'bg-red-600 text-white hover:bg-red-700 focus-visible:outline-red-600 shadow-sm',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'text-xs px-3 py-1.5 gap-1.5 rounded-lg',
  md: 'text-sm px-4 py-2.5 gap-2 rounded-xl',
  lg: 'text-base px-6 py-3.5 gap-2.5 rounded-xl',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  disabled,
  className = '',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      // aria-busy tells a screen reader the action is in flight, which the
      // spinner alone does not convey.
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center font-semibold transition-colors
        focus-visible:outline-2 focus-visible:outline-offset-2
        disabled:opacity-50 disabled:cursor-not-allowed
        ${BUTTON_VARIANTS[variant]} ${BUTTON_SIZES[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

/* --------------------------------------------------------------- form fields */

interface FieldShellProps {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}

function FieldShell({ label, htmlFor, error, hint, required, children }: FieldShellProps) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-sm font-semibold text-slate-800 mb-1.5">
        {label}
        {required && (
          <span className="text-red-600 ml-0.5" aria-label="required">
            *
          </span>
        )}
      </label>
      {children}
      {/* role="alert" so the message is announced the moment it appears. */}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="mt-1.5 text-xs text-red-700 flex items-start gap-1.5">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-px" aria-hidden />
          <span>{error}</span>
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="mt-1.5 text-xs text-slate-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

const INPUT_BASE =
  'w-full rounded-xl border px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 ' +
  'transition-colors focus:outline-2 focus:outline-offset-0 bg-white';

const inputTone = (hasError: boolean) =>
  hasError
    ? 'border-red-400 focus:outline-red-500 bg-red-50/40'
    : 'border-slate-300 focus:outline-cyan-600 hover:border-slate-400';

export interface TextFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
}

export function TextField({ label, error, hint, id, required, className = '', ...rest }: TextFieldProps) {
  const fieldId = id ?? rest.name ?? label.replace(/\s+/g, '-').toLowerCase();
  return (
    <FieldShell label={label} htmlFor={fieldId} error={error} hint={hint} required={required}>
      <input
        {...rest}
        id={fieldId}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
        className={`${INPUT_BASE} ${inputTone(Boolean(error))} ${className}`}
      />
    </FieldShell>
  );
}

export interface TextAreaFieldProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  error?: string;
  hint?: string;
}

export function TextAreaField({
  label,
  error,
  hint,
  id,
  required,
  className = '',
  ...rest
}: TextAreaFieldProps) {
  const fieldId = id ?? rest.name ?? label.replace(/\s+/g, '-').toLowerCase();
  return (
    <FieldShell label={label} htmlFor={fieldId} error={error} hint={hint} required={required}>
      <textarea
        {...rest}
        id={fieldId}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
        className={`${INPUT_BASE} ${inputTone(Boolean(error))} resize-y min-h-24 ${className}`}
      />
    </FieldShell>
  );
}

export interface SelectFieldProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  error?: string;
  hint?: string;
}

export function SelectField({
  label,
  error,
  hint,
  id,
  required,
  className = '',
  children,
  ...rest
}: SelectFieldProps) {
  const fieldId = id ?? rest.name ?? label.replace(/\s+/g, '-').toLowerCase();
  return (
    <FieldShell label={label} htmlFor={fieldId} error={error} hint={hint} required={required}>
      <select
        {...rest}
        id={fieldId}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
        className={`${INPUT_BASE} ${inputTone(Boolean(error))} ${className}`}
      >
        {children}
      </select>
    </FieldShell>
  );
}

/* --------------------------------------------------------------- feedback UI */

export function Alert({
  tone = 'info',
  title,
  children,
}: {
  tone?: 'info' | 'success' | 'warning' | 'error';
  title?: string;
  children: React.ReactNode;
}) {
  const tones = {
    info: 'bg-sky-50 border-sky-200 text-sky-900',
    success: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    warning: 'bg-amber-50 border-amber-200 text-amber-900',
    error: 'bg-red-50 border-red-200 text-red-900',
  };
  const Icon = tone === 'success' ? Check : AlertCircle;
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`rounded-xl border px-4 py-3 text-sm flex gap-2.5 ${tones[tone]}`}
    >
      <Icon className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
      <div className="min-w-0">
        {title && <p className="font-bold mb-0.5">{title}</p>}
        <div className="leading-relaxed">{children}</div>
      </div>
    </div>
  );
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div role="status" className="flex flex-col items-center justify-center gap-3 py-16 text-slate-500">
      <Loader2 className="h-7 w-7 animate-spin text-cyan-700" aria-hidden />
      <p className="text-sm">{label}</p>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="text-center py-16 px-6">
      {icon && <div className="mx-auto mb-4 text-slate-300">{icon}</div>}
      <h3 className="text-base font-bold text-slate-900">{title}</h3>
      <p className="mt-1.5 text-sm text-slate-500 max-w-md mx-auto leading-relaxed">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Badge({
  tone = 'slate',
  children,
}: {
  tone?: 'slate' | 'cyan' | 'emerald' | 'amber' | 'red' | 'indigo';
  children: React.ReactNode;
}) {
  const tones = {
    slate: 'bg-slate-100 text-slate-700 border-slate-200',
    cyan: 'bg-cyan-50 text-cyan-800 border-cyan-200',
    emerald: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    amber: 'bg-amber-50 text-amber-800 border-amber-200',
    red: 'bg-red-50 text-red-800 border-red-200',
    indigo: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  };
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-bold ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------- ratings */

export function StarRating({
  value,
  count,
  size = 'sm',
  showCount = true,
}: {
  value: number;
  count?: number;
  size?: 'sm' | 'md';
  showCount?: boolean;
}) {
  const dimension = size === 'md' ? 'h-4.5 w-4.5' : 'h-3.5 w-3.5';
  const rounded = Math.round(value);

  if (!count) {
    return <span className="text-xs text-slate-400">No reviews yet</span>;
  }

  return (
    <div className="flex items-center gap-1.5">
      <div
        className="flex items-center gap-px"
        role="img"
        aria-label={`Rated ${value} out of 5 from ${count} review${count === 1 ? '' : 's'}`}
      >
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            aria-hidden
            className={`${dimension} ${star <= rounded ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`}
          />
        ))}
      </div>
      {showCount && (
        <span className="text-xs text-slate-600 font-semibold">
          {value.toFixed(1)} <span className="text-slate-400 font-normal">({count})</span>
        </span>
      )}
    </div>
  );
}

/** Interactive star picker for the feedback form. */
export function StarPicker({
  value,
  onChange,
  error,
}: {
  value: number;
  onChange: (rating: number) => void;
  error?: string;
}) {
  const labels = ['Poor', 'Fair', 'Good', 'Very good', 'Excellent'];
  return (
    <div>
      <span className="block text-sm font-semibold text-slate-800 mb-1.5">
        Your rating<span className="text-red-600 ml-0.5">*</span>
      </span>
      {/* A radio group rather than buttons, so arrow keys work and the choice
          is announced as one control with five options. */}
      <div role="radiogroup" aria-label="Your rating" className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            role="radio"
            aria-checked={value === star}
            aria-label={`${star} star${star === 1 ? '' : 's'} — ${labels[star - 1]}`}
            onClick={() => onChange(star)}
            className="p-1 rounded-lg hover:bg-amber-50 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-amber-500 transition-colors"
          >
            <Star
              className={`h-7 w-7 transition-colors ${
                star <= value ? 'fill-amber-400 text-amber-400' : 'text-slate-300 hover:text-amber-300'
              }`}
            />
          </button>
        ))}
        {value > 0 && (
          <span className="ml-2 text-sm font-semibold text-slate-700">{labels[value - 1]}</span>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-1.5 text-xs text-red-700 flex items-center gap-1.5">
          <AlertCircle className="h-3.5 w-3.5" aria-hidden />
          {error}
        </p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------- layout */

export function PageHeader({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="border-b border-slate-200 bg-linear-to-b from-slate-50 to-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
        {eyebrow && (
          <p className="text-xs font-bold uppercase tracking-widest text-cyan-700 mb-2">{eyebrow}</p>
        )}
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">{title}</h1>
        {description && (
          <p className="mt-3 text-base text-slate-600 max-w-3xl leading-relaxed">{description}</p>
        )}
        {children && <div className="mt-6">{children}</div>}
      </div>
    </div>
  );
}

export function Section({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 ${className}`}>{children}</section>
  );
}
