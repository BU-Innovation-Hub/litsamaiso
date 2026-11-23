import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { TriangleAlert, X } from 'lucide-react';

export const inputClass = 'mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-normal outline-none focus:border-active-clr';
export const labelClass = 'block text-sm font-medium text-slate-700';
export const primaryButton = 'inline-flex items-center gap-2 rounded-md bg-button px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60';
export const secondaryButton = 'inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60';
export const iconButton = 'inline-flex rounded-md border border-slate-300 p-2 text-slate-700 hover:bg-slate-50';
export const dangerIconButton = 'inline-flex rounded-md border border-rose-200 p-2 text-rose-700 hover:bg-rose-50';

// A yes-or-no question that sits above any open modal. Escape, the backdrop and Cancel all say no.
export const ConfirmDialog: React.FC<{
  open: boolean;
  title: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  children: React.ReactNode;
}> = ({ open, title, confirmLabel, cancelLabel = 'Cancel', onConfirm, onCancel, children }) => (
  <Dialog.Root open={open} onOpenChange={(next) => { if (!next) onCancel(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-70 bg-slate-950/50" />
      <Dialog.Content className="fixed left-1/2 top-1/2 z-70 w-[calc(100vw-32px)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-2xl focus:outline-none">
        <div className="flex items-start gap-3">
          <span className="rounded-full bg-amber-100 p-2 text-amber-700"><TriangleAlert className="h-5 w-5" /></span>
          <div className="min-w-0">
            <Dialog.Title className="text-base font-semibold text-slate-950">{title}</Dialog.Title>
            <Dialog.Description asChild><div className="mt-2 space-y-2 text-sm text-slate-600">{children}</div></Dialog.Description>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <Dialog.Close asChild><button type="button" className={secondaryButton}>{cancelLabel}</button></Dialog.Close>
          <button type="button" onClick={onConfirm} className={primaryButton}>{confirmLabel}</button>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
);

export const Modal: React.FC<{
  title: string;
  subtitle?: string;
  busy?: boolean;
  submitLabel?: string;
  busyLabel?: string;
  wide?: boolean;
  onClose: () => void;
  onSubmit?: () => void | Promise<void>;
  children: React.ReactNode;
}> = ({ title, subtitle, busy, submitLabel = 'Save', busyLabel = 'Saving...', wide, onClose, onSubmit, children }) => {
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    void onSubmit?.();
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-slate-950/40" />
      <form onSubmit={submit} className={`relative z-10 max-h-[90vh] w-full ${wide ? 'max-w-3xl' : 'max-w-xl'} overflow-y-auto rounded-xl bg-white p-6 shadow-2xl`}>
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
            {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="mt-5 space-y-4">{children}</div>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} className={secondaryButton}>{onSubmit ? 'Cancel' : 'Close'}</button>
          {onSubmit && <button disabled={busy} className={primaryButton}>{busy ? busyLabel : submitLabel}</button>}
        </div>
      </form>
    </div>
  );
};

export const Table: React.FC<{ headers: string[]; empty: string; loading?: boolean; children: React.ReactNode; rowCount: number }> = ({ headers, empty, loading, children, rowCount }) => (
  <div className="overflow-hidden rounded-lg border border-slate-200">
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200">
        <thead className="bg-slate-50">
          <tr>{headers.map((head) => <th key={head} className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">{head}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {loading && rowCount === 0
            ? <tr><td colSpan={headers.length} className="px-4 py-8 text-center text-sm text-slate-500">Loading...</td></tr>
            : rowCount === 0
              ? <tr><td colSpan={headers.length} className="px-4 py-8 text-center text-sm text-slate-500">{empty}</td></tr>
              : children}
        </tbody>
      </table>
    </div>
  </div>
);

export const cell = 'px-4 py-3 text-sm text-slate-600';
