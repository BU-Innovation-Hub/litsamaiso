import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { AlertTriangle, CreditCard, ExternalLink, GraduationCap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatMaluti, getPlan } from '@/config/plans';
import { billingService, type BillingSummary } from '@/services/billingService';
import { getApiErrorMessage } from '@/utils/apiError';
import { Hint } from '@/components/ui/tooltip';

const statusStyles: Record<BillingSummary['status'], { label: string; className: string }> = {
  active: { label: 'Active', className: 'bg-emerald-50 text-emerald-700' },
  grace: { label: 'Payment overdue', className: 'bg-amber-50 text-amber-800' },
  canceled: { label: 'Cancelled', className: 'bg-red-50 text-red-700' },
  manual: { label: 'Managed by Litsamaiso', className: 'bg-slate-100 text-slate-700' },
};

const formatDate = (value: string | null) =>
  value ? new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';

const BillingSettingsPage = () => {
  const [billing, setBilling] = useState<BillingSummary | null>(null);
  const [error, setError] = useState('');
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    billingService
      .getStatus()
      .then(setBilling)
      .catch((err) => setError(getApiErrorMessage(err, 'Could not load billing')));
  }, []);

  const openPortal = async () => {
    setOpening(true);
    try {
      window.location.assign(await billingService.openPortal());
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Could not open billing'));
      setOpening(false);
    }
  };

  if (error) return <div className="p-8 text-sm text-red-600">{error}</div>;
  if (!billing) {
    return (
      <div className="flex justify-center p-16">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-active-clr" />
      </div>
    );
  }

  const plan = billing.plan ? getPlan(billing.plan) : null;
  const status = statusStyles[billing.status];
  const { students, studentCap } = billing.usage;
  const usagePct = studentCap ? Math.min(100, Math.round((students / studentCap) * 100)) : 0;
  const nearCap = studentCap !== null && usagePct >= 90;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-8">
      <header>
        <h1 className="text-2xl font-bold text-primary-clr">Billing</h1>
        <p className="mt-1 text-sm text-slate-500">Your plan, renewal and usage.</p>
      </header>

      {(billing.status === 'grace' || billing.status === 'canceled') && billing.graceEndsAt && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" role="alert">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Access for your institution will be paused on <strong>{formatDate(billing.graceEndsAt)}</strong> unless the
            subscription is paid. Update your card in the billing portal to fix this.
          </p>
        </div>
      )}

      <section data-tour="billing-plan" className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Current plan</p>
            <p className="mt-1 text-2xl font-bold text-primary-clr">{billing.planName ?? 'Custom arrangement'}</p>
            {plan && <p className="text-sm text-slate-500">{formatMaluti(plan.priceLsl)} / year, billed in ZAR</p>}
          </div>
          <span className={cn('self-start rounded-full px-3 py-1 text-xs font-semibold', status.className)}>{status.label}</span>
        </div>

        <dl className="mt-6 grid gap-4 border-t border-slate-100 pt-6 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-slate-500">{billing.cancelAtPeriodEnd ? 'Ends on' : 'Renews on'}</dt>
            <dd className="mt-1 font-medium text-slate-900">{formatDate(billing.currentPeriodEnd)}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Payment method & invoices</dt>
            <dd className="mt-1 font-medium text-slate-900">{billing.hasStripeCustomer ? 'Managed in the billing portal' : '—'}</dd>
          </div>
        </dl>

        <div className="mt-6 flex flex-wrap gap-3">
          {billing.hasStripeCustomer ? (
            <button
              type="button"
              onClick={openPortal}
              disabled={opening}
              className="inline-flex items-center gap-2 rounded-lg bg-active-clr px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
            >
              <CreditCard className="h-4 w-4" />
              {opening ? 'Opening…' : 'Manage billing & plan'}
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
          ) : (
            <p className="text-sm text-slate-500">
              Your billing is handled directly by Litsamaiso. Contact{' '}
              <a href="mailto:support@litsamaiso.com" className="font-medium underline">
                support@litsamaiso.com
              </a>{' '}
              for changes.
            </p>
          )}
          <Link
            to="/pricing"
            className="inline-flex items-center rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Compare plans
          </Link>
        </div>
      </section>

      <section data-tour="billing-usage" className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <GraduationCap className="h-5 w-5 text-primary-clr" />
          <h2 className="font-semibold text-primary-clr">Students</h2>
          <Hint content="Counts every student record imported into your registry, whether or not they have signed up yet." />
        </div>
        <p className="mt-3 text-3xl font-bold text-slate-900">
          {students.toLocaleString('en-US')}
          <span className="ml-1 text-base font-medium text-slate-500">
            {studentCap === null ? '· unlimited' : `of ${studentCap.toLocaleString('en-US')}`}
          </span>
        </p>
        {studentCap !== null && (
          <>
            <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className={cn('h-full rounded-full transition-all', nearCap ? 'bg-amber-500' : 'bg-active-clr')}
                style={{ width: `${usagePct}%` }}
              />
            </div>
            {nearCap && (
              <p className="mt-3 text-sm text-amber-800">
                You’re close to your plan’s limit. Upgrade from the billing portal to keep importing students.
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );
};

export default BillingSettingsPage;
