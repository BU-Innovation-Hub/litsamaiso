import React, { useState } from 'react';
import { toast } from 'sonner';
import { Lock, Pencil, ShieldCheck } from 'lucide-react';
import { formatMaluti, formatRand, formatStudentCap, getPlan } from '@/config/plans';
import { getPreset, mix } from '@/theme/palette';
import { toFieldError, type OnboardingDraft } from '@/services/onboardingService';
import type { StepId } from './onboardingSteps';
import { StepHeader } from './FormField';

interface ReviewStepProps {
  draft: OnboardingDraft;
  canceled: boolean;
  onEdit: (step: StepId) => void;
  onCheckout: () => Promise<void>;
  onBack: () => void;
}

const Section: React.FC<{ title: string; onEdit: () => void; children: React.ReactNode }> = ({ title, onEdit, children }) => (
  <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
    <div className="mb-4 flex items-center justify-between">
      <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">{title}</h2>
      <button
        type="button"
        onClick={onEdit}
        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
      >
        <Pencil className="h-3.5 w-3.5" /> Edit
      </button>
    </div>
    {children}
  </section>
);

const Row: React.FC<{ label: string; value?: React.ReactNode }> = ({ label, value }) =>
  value ? (
    <div className="flex justify-between gap-6 py-1.5 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-900">{value}</dd>
    </div>
  ) : null;

export const ReviewStep: React.FC<ReviewStepProps> = ({ draft, canceled, onEdit, onCheckout, onBack }) => {
  const [redirecting, setRedirecting] = useState(false);
  const plan = getPlan(draft.plan);
  const renewal = new Date();
  renewal.setFullYear(renewal.getFullYear() + 1);
  const theme = draft.theme;
  const themeName = theme ? getPreset(theme.preset)?.name ?? 'Custom theme' : 'Litsamaiso Classic';

  const handleCheckout = async () => {
    setRedirecting(true);
    try {
      await onCheckout();
    } catch (error) {
      toast.error(toFieldError(error).message);
      setRedirecting(false);
    }
  };

  return (
    <div>
      <StepHeader
        eyebrow="Step 5 of 5"
        title="Review and pay"
        description="Check everything looks right. You'll complete payment on Stripe's secure checkout page."
      />

      {canceled && (
        <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700 shadow-sm" role="status">
          Payment was cancelled — nothing was charged and your details are saved. Continue whenever you're ready.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          <Section title="Institution" onEdit={() => onEdit('institution')}>
            <dl>
              <Row label="Name" value={draft.institution.name} />
              <Row label="Email" value={draft.institution.email} />
              <Row label="Phone" value={draft.institution.phone} />
              <Row label="Country" value={draft.institution.country} />
              <Row label="Website" value={draft.institution.website} />
            </dl>
          </Section>
          <Section title="Institution Admin" onEdit={() => onEdit('admin')}>
            <dl>
              <Row label="Name" value={draft.admin.name} />
              <Row label="Title" value={draft.admin.title} />
              <Row label="Sign-in email" value={draft.admin.email} />
              <Row
                label="Role"
                value={
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-2.5 py-0.5 text-xs font-semibold text-white">
                    <ShieldCheck className="h-3.5 w-3.5" /> Institution Admin
                  </span>
                }
              />
            </dl>
          </Section>
          <Section title="Workspace theme" onEdit={() => onEdit('theme')}>
            <div className="flex items-center gap-4">
              {theme && (
                <div className="flex h-10 w-28 overflow-hidden rounded-lg border border-slate-200">
                  <span style={{ flex: 6, background: theme.surface === 'soft' ? mix('#ffffff', theme.primary, 0.045) : '#f8fafc' }} />
                  <span style={{ flex: 3, background: theme.primary }} />
                  <span style={{ flex: 1, background: theme.accent }} />
                </div>
              )}
              <p className="text-sm font-medium text-slate-900">{themeName}</p>
            </div>
          </Section>
        </div>

        <aside className="lg:sticky lg:top-8 lg:self-start">
          <div className="rounded-3xl border border-slate-900 bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-900">{plan.name} plan</p>
                <p className="text-xs text-slate-500">{formatStudentCap(plan.studentCap)}</p>
              </div>
              <button type="button" onClick={() => onEdit('plan')} className="text-xs font-semibold text-slate-500 hover:text-slate-900">
                Change
              </button>
            </div>
            <div className="my-5 border-t border-dashed border-slate-200" />
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500">Annual subscription</dt>
                <dd className="font-medium text-slate-900">{formatMaluti(plan.priceLsl)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Renews</dt>
                <dd className="font-medium text-slate-900">
                  {renewal.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </dd>
              </div>
            </dl>
            <div className="my-5 border-t border-slate-200" />
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-semibold text-slate-900">Due today</span>
              <span className="text-3xl font-semibold tracking-tight text-slate-900">{formatMaluti(plan.priceLsl)}</span>
            </div>
            <p className="mt-2 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">
              You'll be charged <strong>{formatRand(plan.priceLsl)} (ZAR)</strong>. The Loti is pegged 1:1 to the Rand, so this
              equals {formatMaluti(plan.priceLsl)}.
            </p>
            <button
              type="button"
              onClick={handleCheckout}
              disabled={redirecting}
              className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-slate-900 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-60"
            >
              {redirecting ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              ) : (
                <Lock className="h-4 w-4" />
              )}
              {redirecting ? 'Opening secure checkout…' : 'Continue to secure payment'}
            </button>
            <p className="mt-3 text-center text-xs text-slate-500">Payments are processed by Stripe. Cancel any time from Billing.</p>
          </div>
          <button
            type="button"
            onClick={onBack}
            className="mt-4 w-full rounded-full px-5 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
          >
            Back
          </button>
        </aside>
      </div>
    </div>
  );
};
