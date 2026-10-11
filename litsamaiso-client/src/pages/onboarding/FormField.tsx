import React from 'react';
import { cn } from '@/lib/utils';

interface FormFieldProps {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: React.ReactNode;
  optional?: boolean;
  className?: string;
  children: React.ReactNode;
}

export const FormField: React.FC<FormFieldProps> = ({ label, htmlFor, error, hint, optional, className, children }) => (
  <div className={cn('space-y-1.5', className)}>
    <label htmlFor={htmlFor} className="flex items-baseline justify-between text-sm font-semibold text-slate-800">
      {label}
      {optional && <span className="text-xs font-normal text-slate-400">Optional</span>}
    </label>
    {children}
    {error ? (
      <p className="text-xs font-medium text-red-600" role="alert">
        {error}
      </p>
    ) : (
      hint && <p className="text-xs text-slate-500">{hint}</p>
    )}
  </div>
);

export const StepHeader: React.FC<{ eyebrow: string; title: string; description?: React.ReactNode }> = ({
  eyebrow,
  title,
  description,
}) => (
  <header className="mb-8">
    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{eyebrow}</p>
    <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">{title}</h1>
    {description && <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">{description}</p>}
  </header>
);

export const StepActions: React.FC<{
  onBack?: () => void;
  submitLabel: string;
  submitting?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
}> = ({ onBack, submitLabel, submitting, disabled, icon }) => (
  <div className="mt-10 flex flex-col-reverse gap-3 border-t border-slate-200 pt-6 sm:flex-row sm:items-center sm:justify-between">
    {onBack ? (
      <button
        type="button"
        onClick={onBack}
        className="rounded-full px-5 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
      >
        Back
      </button>
    ) : (
      <span />
    )}
    <button
      type="submit"
      disabled={submitting || disabled}
      className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-slate-900 px-7 py-3 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:translate-y-0 disabled:opacity-50"
    >
      {submitting ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
      ) : (
        icon
      )}
      {submitLabel}
    </button>
  </div>
);
