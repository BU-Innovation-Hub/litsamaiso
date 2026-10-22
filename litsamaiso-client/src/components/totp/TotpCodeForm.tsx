import React, { useEffect, useId, useRef, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { Button } from '../elections/ui';
import { cn } from '../../lib/utils';

const CODE_LENGTH = 6;

type TotpCodeFormProps = {
  // Called once per code: automatically at 6 digits, or from the button
  onSubmit: (code: string) => Promise<void>;
  submitLabel: string;
  busy?: boolean;
  label?: string;
  hint?: string;
  autoFocus?: boolean;
};

const TotpCodeForm: React.FC<TotpCodeFormProps> = ({
  onSubmit,
  submitLabel,
  busy = false,
  label = 'Authenticator code',
  hint = 'Open your authenticator app and enter the 6-digit code shown for Litsamaiso.',
  autoFocus = true,
}) => {
  const inputId = useId();
  const hintId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState('');
  const submittingRef = useRef(false);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const submit = async (value: string) => {
    if (value.length !== CODE_LENGTH || submittingRef.current) return;
    submittingRef.current = true;
    try {
      await onSubmit(value);
    } finally {
      submittingRef.current = false;
      // Each code works once, so the next attempt always starts from an empty field
      setCode('');
      inputRef.current?.focus();
    }
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const digits = event.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH);
    setCode(digits);
    if (digits.length === CODE_LENGTH) void submit(digits);
  };

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        void submit(code);
      }}
    >
      <label htmlFor={inputId} className="block text-sm font-medium text-primary-clr">
        {label}
      </label>
      <input
        ref={inputRef}
        id={inputId}
        name="totp"
        value={code}
        onChange={handleChange}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="\d{6}"
        maxLength={CODE_LENGTH}
        placeholder="000000"
        disabled={busy}
        aria-describedby={hintId}
        className={cn(
          'h-14 w-full rounded-xl border border-slate-200 bg-white text-center font-mono text-2xl tracking-[0.5em] text-primary-clr placeholder:text-slate-300',
          'transition focus:border-active focus:outline-none focus:ring-4 focus:ring-active/10 disabled:bg-slate-50',
        )}
      />
      <p id={hintId} className="text-xs text-slate-500">
        {hint}
      </p>
      <Button
        type="submit"
        className="h-11 w-full"
        icon={ShieldCheck}
        loading={busy}
        disabled={code.length !== CODE_LENGTH}
      >
        {submitLabel}
      </Button>
    </form>
  );
};

export default TotpCodeForm;
