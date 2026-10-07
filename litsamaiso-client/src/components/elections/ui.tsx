import React, { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Loader2, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { STATUS_LABELS, type ElectionStatus } from './electionHelpers';

// Shared building blocks for the elections screens, styled on the app's palette
// (button navy, primary-clr ink, active indigo, slate neutrals).

export const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-primary-clr placeholder:text-slate-400 transition focus:border-active focus:outline-none focus:ring-4 focus:ring-active/10 disabled:bg-slate-50';

export const Card = ({ className, children }: { className?: string; children: React.ReactNode }) => (
  <section className={cn('rounded-3xl border border-white/70 bg-white/90 shadow-sm backdrop-blur', className)}>
    {children}
  </section>
);

export const CardHeader = ({
  title,
  icon: Icon,
  action,
}: {
  title: string;
  icon?: React.ElementType;
  action?: React.ReactNode;
}) => (
  <div className="flex min-h-14 items-center justify-between gap-3 border-b border-slate-100 px-5 py-2">
    <h3 className="flex items-center gap-2 text-sm font-semibold text-primary-clr">
      {Icon && <Icon className="h-4 w-4 text-slate-400" />}
      {title}
    </h3>
    {action}
  </div>
);

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-ghost';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-button text-white shadow-sm shadow-slate-900/10 hover:bg-primary-clr',
  secondary: 'border border-slate-200 bg-white text-primary-clr hover:border-slate-300 hover:bg-slate-50',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-primary-clr',
  danger: 'bg-red-600 text-white hover:bg-red-700',
  'danger-ghost': 'text-red-600 hover:bg-red-50',
};

export const Button = ({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon: Icon,
  className,
  children,
  disabled,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  loading?: boolean;
  icon?: React.ElementType;
}) => (
  <button
    type="button"
    disabled={disabled || loading}
    className={cn(
      'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-semibold transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50',
      size === 'sm' ? 'h-8 px-3 text-xs' : 'h-10 px-4 text-sm',
      BUTTON_VARIANTS[variant],
      className,
    )}
    {...props}
  >
    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : Icon ? <Icon className="h-4 w-4" /> : null}
    {children}
  </button>
);

export const IconButton = ({
  label,
  icon: Icon,
  tone = 'default',
  loading = false,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  icon: React.ElementType;
  tone?: 'default' | 'danger' | 'success';
  loading?: boolean;
}) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    disabled={props.disabled || loading}
    className={cn(
      'inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition disabled:opacity-50',
      tone === 'danger' && 'hover:bg-red-50 hover:text-red-600',
      tone === 'success' && 'hover:bg-emerald-50 hover:text-emerald-600',
      tone === 'default' && 'hover:bg-slate-100 hover:text-primary-clr',
      className,
    )}
    {...props}
  >
    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
  </button>
);

const STATUS_STYLES: Record<ElectionStatus, { pill: string; dot: string }> = {
  DRAFT: { pill: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' },
  SCHEDULED: { pill: 'bg-active/10 text-active', dot: 'bg-active' },
  OPEN: { pill: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500 animate-pulse' },
  CLOSED: { pill: 'bg-amber-50 text-amber-700', dot: 'bg-amber-500' },
  COUNTING: { pill: 'bg-amber-50 text-amber-700', dot: 'bg-amber-500 animate-pulse' },
  RESULTS_PUBLISHED: { pill: 'bg-button text-white', dot: 'bg-white' },
  ARCHIVED: { pill: 'bg-slate-100 text-slate-500', dot: 'bg-slate-300' },
};

export const StatusPill = ({ status, label }: { status: ElectionStatus; label?: string }) => (
  <span
    className={cn(
      'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold',
      STATUS_STYLES[status].pill,
    )}
  >
    <span className={cn('h-1.5 w-1.5 rounded-full', STATUS_STYLES[status].dot)} />
    {label || STATUS_LABELS[status]}
  </span>
);

export const Pill = ({
  tone = 'slate',
  children,
  className,
}: {
  tone?: 'slate' | 'green' | 'amber' | 'red' | 'indigo';
  children: React.ReactNode;
  className?: string;
}) => {
  const tones = {
    slate: 'bg-slate-100 text-slate-600',
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-red-50 text-red-600',
    indigo: 'bg-active/10 text-active',
  };
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold', tones[tone], className)}>
      {children}
    </span>
  );
};

export const ProgressBar = ({ value, tone = 'indigo' }: { value: number; tone?: 'indigo' | 'green' | 'amber' }) => (
  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
    <div
      className={cn(
        'h-full rounded-full transition-[width] duration-700 ease-out',
        tone === 'indigo' && 'bg-active',
        tone === 'green' && 'bg-emerald-500',
        tone === 'amber' && 'bg-amber-500',
      )}
      style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
    />
  </div>
);

export const Skeleton = ({ className }: { className?: string }) => (
  <div className={cn('animate-pulse rounded-xl bg-slate-200/70', className)} />
);

export const EmptyState = ({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: React.ElementType;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) => (
  <div className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
    <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
      <Icon className="h-6 w-6" />
    </span>
    <p className="font-semibold text-primary-clr">{title}</p>
    {description && <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>}
    {action && <div className="mt-5">{action}</div>}
  </div>
);

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

export const Avatar = ({
  name,
  imageUrl,
  size = 'md',
  className,
}: {
  name: string;
  imageUrl?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) => {
  const [failed, setFailed] = useState(false);
  const sizes = { sm: 'h-8 w-8 text-xs', md: 'h-10 w-10 text-sm', lg: 'h-14 w-14 text-base' };
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-active/10 font-semibold text-active ring-2 ring-white',
        sizes[size],
        className,
      )}
    >
      {imageUrl && !failed ? (
        <img src={imageUrl} alt="" className="h-full w-full object-cover" onError={() => setFailed(true)} />
      ) : (
        initialsOf(name) || '?'
      )}
    </span>
  );
};

export const Field = ({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) => (
  <label className="block space-y-1.5">
    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
    {children}
    {hint && <span className="block text-xs text-slate-400">{hint}</span>}
  </label>
);

// A labelled on/off switch row, e.g. for "Email students"
export const ToggleRow = ({
  icon: Icon,
  label,
  description,
  checked,
  onChange,
  disabled = false,
}: {
  icon?: React.ElementType;
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) => (
  <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 p-3">
    <div className="flex min-w-0 items-start gap-3">
      {Icon && (
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-active/10 text-active">
          <Icon className="h-4 w-4" />
        </span>
      )}
      <div className="min-w-0">
        <p className="text-sm font-semibold text-primary-clr">{label}</p>
        {description && <p className="text-xs text-slate-500">{description}</p>}
      </div>
    </div>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-50',
        checked ? 'bg-active' : 'bg-slate-200',
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left]',
          checked ? 'left-5.5' : 'left-0.5',
        )}
      />
    </button>
  </div>
);

export const Modal = ({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) => (
  <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-primary-clr/40 backdrop-blur-sm data-[state=open]:animate-[fadeIn_150ms_ease-out]" />
      <Dialog.Content
        className={cn(
          'fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-3xl bg-white shadow-2xl shadow-slate-900/20 focus:outline-none data-[state=open]:animate-[popIn_180ms_ease-out]',
          size === 'sm' && 'max-w-md',
          size === 'md' && 'max-w-lg',
          size === 'lg' && 'max-w-2xl',
        )}
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-6">
          <div>
            <Dialog.Title className="text-lg font-semibold text-primary-clr">{title}</Dialog.Title>
            {description ? (
              <Dialog.Description className="mt-1 text-sm text-slate-500">{description}</Dialog.Description>
            ) : (
              <Dialog.Description className="sr-only">{title}</Dialog.Description>
            )}
          </div>
          <Dialog.Close asChild>
            <IconButton label="Close" icon={X} />
          </Dialog.Close>
        </div>
        {children && <div className="overflow-y-auto px-6 py-5">{children}</div>}
        {footer && (
          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-6 py-4">{footer}</div>
        )}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
);

export const ConfirmModal = ({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  tone = 'primary',
  busy = false,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel: string;
  tone?: 'primary' | 'danger';
  busy?: boolean;
  onConfirm: () => void;
  children?: React.ReactNode;
}) => (
  <Modal
    open={open}
    onOpenChange={(next) => !busy && onOpenChange(next)}
    title={title}
    description={description}
    size="sm"
    footer={
      <>
        <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
          Cancel
        </Button>
        <Button variant={tone === 'danger' ? 'danger' : 'primary'} loading={busy} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </>
    }
  >
    {children}
  </Modal>
);
