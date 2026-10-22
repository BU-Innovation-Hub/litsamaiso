import React, { useState } from 'react';
import { Check, Copy, Loader2, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../elections/ui';
import TotpCodeForm from './TotpCodeForm';
import type { TotpEnrollment as Enrollment } from '../../services/totpService';

// Shown in groups of four, the way authenticator apps expect a typed key
const formatSecret = (secret: string) => secret.match(/.{1,4}/g)?.join(' ') ?? secret;

type TotpEnrollmentProps = {
  enrollment: Enrollment | null;
  loading?: boolean;
  busy?: boolean;
  submitLabel: string;
  onConfirm: (code: string) => Promise<void>;
  // Fetches a new QR code, e.g. after the previous setup expired
  onRegenerate?: () => void;
};

const TotpEnrollment: React.FC<TotpEnrollmentProps> = ({
  enrollment,
  loading = false,
  busy = false,
  submitLabel,
  onConfirm,
  onRegenerate,
}) => {
  const [copied, setCopied] = useState(false);

  const copySecret = async () => {
    if (!enrollment) return;
    try {
      await navigator.clipboard.writeText(enrollment.secret);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy the key. Type it into your app instead.');
    }
  };

  if (loading || !enrollment) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-sm text-slate-500">
        {loading ? (
          <>
            <Loader2 className="h-6 w-6 animate-spin text-active" />
            Preparing your authenticator setup...
          </>
        ) : (
          onRegenerate && (
            <Button variant="secondary" icon={RotateCcw} onClick={onRegenerate}>
              Try again
            </Button>
          )
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-600">
        <li>
          Open an authenticator app such as Google Authenticator, Microsoft Authenticator, Authy or 1Password.
        </li>
        <li>Scan this QR code, or add the key below by hand.</li>
        <li>Enter the 6-digit code the app shows.</li>
      </ol>

      <div className="flex flex-col items-center gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-start">
        <img
          src={enrollment.qrCodeDataUrl}
          alt="QR code to add Litsamaiso to your authenticator app"
          width={176}
          height={176}
          className="h-44 w-44 shrink-0 rounded-xl bg-white p-2"
        />
        <div className="min-w-0 flex-1 space-y-2 text-center sm:text-left">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Can't scan? Enter this key</p>
          <code className="block break-all rounded-lg bg-white px-3 py-2 font-mono text-sm text-primary-clr">
            {formatSecret(enrollment.secret)}
          </code>
          <p className="text-xs text-slate-500">Choose "time-based" if your app asks.</p>
          <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
            <Button variant="secondary" size="sm" icon={copied ? Check : Copy} onClick={() => void copySecret()}>
              {copied ? 'Copied' : 'Copy key'}
            </Button>
            {onRegenerate && (
              <Button variant="ghost" size="sm" icon={RotateCcw} onClick={onRegenerate} disabled={busy}>
                New QR code
              </Button>
            )}
          </div>
        </div>
      </div>

      <TotpCodeForm
        onSubmit={onConfirm}
        submitLabel={submitLabel}
        busy={busy}
        label="Code from your app"
        hint="The code changes every 30 seconds. Enter the one showing now."
      />
    </div>
  );
};

export default TotpEnrollment;
