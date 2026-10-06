import React from 'react';
import { Loader2 } from 'lucide-react';

type ConfirmDialogProps = {
  title: string;
  children: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
  busy?: boolean;
  // Omit to show an acknowledgement-only dialog
  onConfirm?: () => void;
  onCancel: () => void;
};

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  title,
  children,
  confirmLabel,
  cancelLabel = 'Cancel',
  tone = 'default',
  busy = false,
  onConfirm,
  onCancel,
}) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" role="dialog" aria-modal="true">
    <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
      <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
      <div className="mt-3 space-y-2 text-sm text-gray-600">{children}</div>
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-md border px-4 py-2 font-semibold hover:bg-gray-50 disabled:opacity-60"
        >
          {onConfirm ? cancelLabel : confirmLabel}
        </button>
        {onConfirm && (
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`inline-flex items-center gap-2 rounded-md px-4 py-2 font-semibold text-white disabled:opacity-60 ${
              tone === 'danger' ? 'bg-red-600 hover:bg-red-700' : 'bg-button hover:opacity-90'
            }`}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {confirmLabel}
          </button>
        )}
      </div>
    </div>
  </div>
);

export default ConfirmDialog;
