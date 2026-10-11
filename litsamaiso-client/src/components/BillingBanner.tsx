import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { getRoleName } from '../utils/userDisplay';
import { cn } from '../lib/utils';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Warns everyone in an institution whose subscription is in its grace period. */
export const BillingBanner = ({ className }: { className?: string }) => {
  const { user } = useAuth();
  const [now] = useState(() => Date.now());
  const billing = user?.institution?.billing;
  if (!billing || (billing.status !== 'grace' && billing.status !== 'canceled') || !billing.graceEndsAt) return null;

  const daysLeft = Math.max(0, Math.ceil((new Date(billing.graceEndsAt).getTime() - now) / DAY_MS));
  const isAdmin = getRoleName(user) === 'InstitutionAdmin';
  const when = daysLeft === 0 ? 'today' : `in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`;

  return (
    <div role="alert" className={cn('border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 lg:px-8', className)}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {billing.status === 'canceled' ? 'Your subscription has ended.' : 'We couldn’t collect your subscription payment.'}{' '}
            Access for your institution will be paused {when}.
            {!isAdmin && ' Please let your Institution Admin know.'}
          </span>
        </p>
        {isAdmin && (
          <Link
            to="/settings/billing"
            className="shrink-0 rounded-full bg-amber-900 px-4 py-1.5 text-center text-xs font-semibold text-white hover:bg-amber-800"
          >
            Fix billing
          </Link>
        )}
      </div>
    </div>
  );
};
