import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CreditCard, Lock } from 'lucide-react';
import { toast } from 'sonner';
import PasswordInput from '../components/ui/PasswordInput';
import { billingService } from '../services/billingService';
import type { InstitutionLockDetail } from '../lib/api';
import { getApiErrorMessage } from '../utils/apiError';

const inputClass =
  'w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10';

const InstitutionLockedPage: React.FC = () => {
  const location = useLocation();
  const detail = (location.state as InstitutionLockDetail | null) ?? {};
  const billingLock = detail.lockedBy === 'billing';
  const [showRenew, setShowRenew] = useState(billingLock);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleRenew = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      window.location.assign(await billingService.renew(email.trim(), password));
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Could not start renewal'));
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-600">
          <Lock className="h-7 w-7" />
        </div>
        <h1 className="text-2xl font-semibold text-foreground mb-2">
          {billingLock ? 'Subscription inactive' : 'Institution access paused'}
        </h1>
        <p className="text-muted-foreground mb-2">
          {billingLock
            ? "Your institution's Litsamaiso subscription has lapsed, so access is paused. Your data is safe."
            : "Your institution's Litsamaiso workspace is currently locked, so you have been signed out."}
        </p>
        {detail.reason && !billingLock && (
          <p className="text-sm text-foreground mb-2">
            <span className="font-medium">Reason:</span> {detail.reason}
          </p>
        )}
        <p className="text-muted-foreground mb-8">
          {billingLock
            ? 'Your Institution Admin can renew below to restore access for everyone.'
            : 'Please contact your institution administrator or '}
          {!billingLock && (
            <>
              <a href="mailto:support@litsamaiso.com" className="font-medium text-active-clr underline">
                support@litsamaiso.com
              </a>
              .
            </>
          )}
        </p>

        {showRenew ? (
          <form onSubmit={handleRenew} className="mb-6 space-y-3 rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm">
            <p className="text-sm font-semibold text-slate-900">Institution Admin sign-in</p>
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Admin email"
              autoComplete="email"
              className={inputClass}
            />
            <PasswordInput
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Password"
              autoComplete="current-password"
              className={inputClass}
            />
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
            >
              <CreditCard className="h-4 w-4" />
              {submitting ? 'Opening secure billing…' : 'Renew subscription'}
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setShowRenew(true)}
            className="mb-6 text-sm font-medium text-slate-600 underline underline-offset-4 hover:text-slate-900"
          >
            Institution Admin? Renew your subscription
          </button>
        )}

        <div>
          <Link
            to="/login"
            className="inline-block bg-active-clr text-white font-semibold px-6 py-3 rounded-md hover:bg-button transition-colors"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
};

export default InstitutionLockedPage;
