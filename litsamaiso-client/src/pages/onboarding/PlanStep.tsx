import React, { useState } from 'react';
import { ArrowRight, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PLANS, formatMaluti, formatRand, formatStudentCap } from '@/config/plans';
import type { PlanKey } from '@/types';
import { StepActions, StepHeader } from './FormField';

interface PlanStepProps {
  plan: PlanKey;
  onSubmit: (plan: PlanKey) => Promise<void>;
}

export const PlanStep: React.FC<PlanStepProps> = ({ plan, onSubmit }) => {
  const [selected, setSelected] = useState<PlanKey>(plan);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await onSubmit(selected);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <StepHeader
        eyebrow="Step 1 of 5"
        title="Choose the plan that fits"
        description="Every plan includes the full platform. Plans differ only by how many students you can manage — you can upgrade at any time."
      />
      <div role="radiogroup" aria-label="Plan" className="grid gap-4 md:grid-cols-3">
        {PLANS.map((item) => {
          const active = item.key === selected;
          return (
            <button
              key={item.key}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setSelected(item.key)}
              className={cn(
                'relative flex flex-col rounded-3xl border bg-white p-6 text-left transition hover:border-slate-400',
                active ? 'border-slate-900 shadow-lg ring-2 ring-slate-900/10' : 'border-slate-200 shadow-sm',
              )}
            >
              {item.popular && (
                <span className="absolute -top-3 left-6 rounded-full bg-slate-900 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white">
                  Most popular
                </span>
              )}
              <span className="flex items-center justify-between">
                <span className="text-lg font-semibold text-slate-900">{item.name}</span>
                <span
                  className={cn(
                    'flex h-5 w-5 items-center justify-center rounded-full border',
                    active ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300',
                  )}
                >
                  {active && <Check className="h-3 w-3" />}
                </span>
              </span>
              <span className="mt-4 text-3xl font-semibold tracking-tight text-slate-900">
                {formatMaluti(item.priceLsl)}
                <span className="ml-1 text-sm font-medium text-slate-500">/ year</span>
              </span>
              <span className="mt-1 text-xs text-slate-500">{formatRand(item.priceLsl)} ZAR, billed annually</span>
              <span className="mt-4 text-sm font-medium text-slate-700">{formatStudentCap(item.studentCap)}</span>
              <span className="mt-1 text-sm text-slate-500">{item.tagline}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-6 text-sm text-slate-500">
        All plans include unlimited staff accounts, every module and a branded workspace.
      </p>
      <StepActions submitLabel="Continue" submitting={submitting} icon={<ArrowRight className="h-4 w-4" />} />
    </form>
  );
};
