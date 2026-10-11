import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { toast } from 'sonner';
import { Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatMaluti, getPlan, isPlanKey } from '@/config/plans';
import type { PlanKey } from '@/types';
import {
  onboardingService,
  onboardingStorage,
  type DraftUpdate,
  type OnboardingDraft,
} from '@/services/onboardingService';
import { STEPS, firstIncompleteStep, isStepComplete, type StepId } from './onboardingSteps';
import { PlanStep } from './PlanStep';
import { InstitutionStep } from './InstitutionStep';
import { AdminStep } from './AdminStep';
import { ThemeStep } from './ThemeStep';
import { ReviewStep } from './ReviewStep';

const OnboardingPage = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const planParam = params.get('plan');
  const canceled = params.get('canceled') === '1';

  const [plan, setPlan] = useState<PlanKey>(isPlanKey(planParam) ? planParam : 'professional');
  const [draft, setDraft] = useState<OnboardingDraft | null>(null);
  const [step, setStep] = useState<StepId>('plan');
  // A draft started in this tab can be resumed (after a reload or a cancelled checkout).
  const [resumable] = useState(() => {
    const stored = onboardingStorage.get();
    const draftParam = params.get('draft');
    return stored && (!draftParam || draftParam === stored.draftId) ? stored : null;
  });
  const [loading, setLoading] = useState(Boolean(resumable));

  useEffect(() => {
    const stored = resumable;
    if (!stored) return;
    let active = true;
    onboardingService
      .getDraft(stored)
      .then(async (loaded) => {
        if (!active) return;
        if (loaded.status === 'provisioned') {
          onboardingStorage.clear();
          toast.success('This institution is already set up. Please sign in.');
          navigate('/login', { replace: true });
          return;
        }
        let current = loaded;
        if (isPlanKey(planParam) && planParam !== loaded.plan && !canceled) {
          current = await onboardingService.updateDraft(stored, { plan: planParam });
        }
        setDraft(current);
        setPlan(current.plan);
        setStep(canceled ? 'review' : firstIncompleteStep(current));
      })
      .catch(() => onboardingStorage.clear())
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
    // Runs once on mount; later URL changes don't restart onboarding.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [step]);

  const save = useCallback(
    async (update: DraftUpdate) => {
      let stored = onboardingStorage.get();
      if (!stored) {
        await onboardingService.createDraft(update.plan ?? plan);
        stored = onboardingStorage.get();
        if (!stored) throw new Error('Your browser blocked storage needed for onboarding.');
      }
      const updated = await onboardingService.updateDraft(stored, update);
      setDraft(updated);
      setPlan(updated.plan);
      return updated;
    },
    [plan],
  );

  const goTo = (id: StepId) => setStep(id);
  const next = () => setStep(STEPS[Math.min(STEPS.findIndex((s) => s.id === step) + 1, STEPS.length - 1)].id);
  const back = () => setStep(STEPS[Math.max(STEPS.findIndex((s) => s.id === step) - 1, 0)].id);

  const handlePlan = async (selected: PlanKey) => {
    try {
      await save({ plan: selected });
      next();
    } catch {
      toast.error('We couldn’t start your onboarding. Please try again.');
    }
  };

  const handleChangePlan = async (selected: PlanKey) => {
    try {
      await save({ plan: selected });
      toast.success(`Switched to the ${getPlan(selected).name} plan`);
    } catch {
      toast.error('Couldn’t change the plan. Please try again.');
    }
  };

  const saveAndNext = async (update: DraftUpdate) => {
    await save(update);
    next();
  };

  const handleCheckout = async () => {
    const stored = onboardingStorage.get();
    if (!stored) throw new Error('Onboarding session expired');
    const url = await onboardingService.startCheckout(stored);
    window.location.assign(url);
  };

  const stepIndex = STEPS.findIndex((s) => s.id === step);
  const reachable = (id: StepId) => {
    const index = STEPS.findIndex((s) => s.id === id);
    return index <= stepIndex || STEPS.slice(0, index).every((s) => isStepComplete(s.id, draft));
  };
  const currentPlan = getPlan(plan);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-slate-900" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 lg:grid lg:grid-cols-[300px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-screen flex-col bg-slate-950 p-8 text-white lg:flex">
        <Link to="/" className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white">
            <img src="/logo-1.png" alt="" className="h-6 w-6" />
          </span>
          <span className="text-lg font-semibold">Litsamaiso</span>
        </Link>

        <p className="mt-12 text-xs font-semibold uppercase tracking-[0.18em] text-white/50">Set up your institution</p>
        <ol className="mt-6 space-y-1">
          {STEPS.map((item, index) => {
            const done = index < stepIndex;
            const current = item.id === step;
            const enabled = reachable(item.id);
            return (
              <li key={item.id} className="relative">
                {index < STEPS.length - 1 && (
                  <span className={cn('absolute left-[18px] top-9 h-7 w-px', index < stepIndex ? 'bg-white/60' : 'bg-white/15')} />
                )}
                <button
                  type="button"
                  disabled={!enabled}
                  onClick={() => goTo(item.id)}
                  aria-current={current ? 'step' : undefined}
                  className={cn(
                    'flex w-full items-start gap-4 rounded-2xl p-2 text-left transition',
                    current ? 'bg-white/10' : enabled ? 'hover:bg-white/5' : 'cursor-not-allowed opacity-50',
                  )}
                >
                  <span
                    className={cn(
                      'ml-1.5 flex h-5.5 w-5.5 shrink-0 translate-y-0.5 items-center justify-center rounded-full border text-[11px] font-semibold',
                      done ? 'border-white bg-white text-slate-950' : current ? 'border-white text-white' : 'border-white/30 text-white/60',
                    )}
                  >
                    {done ? <Check className="h-3 w-3" /> : index + 1}
                  </span>
                  <span>
                    <span className={cn('block text-sm font-semibold', current ? 'text-white' : 'text-white/80')}>{item.title}</span>
                    <span className="block text-xs text-white/50">{item.description}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>

        <div className="mt-auto space-y-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs text-white/50">Selected plan</p>
            <p className="mt-1 flex items-baseline justify-between">
              <span className="font-semibold">{currentPlan.name}</span>
              <span className="text-sm text-white/80">{formatMaluti(currentPlan.priceLsl)} / yr</span>
            </p>
          </div>
          <p className="text-xs leading-5 text-white/50">
            Questions?{' '}
            <a href="mailto:support@litsamaiso.com" className="font-medium text-white/80 underline">
              support@litsamaiso.com
            </a>
          </p>
        </div>
      </aside>

      <div className="min-w-0">
        <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur lg:hidden">
          <div className="flex items-center justify-between px-5 py-3">
            <Link to="/" className="flex items-center gap-2">
              <img src="/logo-1.png" alt="" className="h-7 w-7" />
              <span className="font-semibold text-slate-900">Litsamaiso</span>
            </Link>
            <span className="text-xs font-medium text-slate-500">
              Step {stepIndex + 1} of {STEPS.length} · {STEPS[stepIndex].title}
            </span>
          </div>
          <div className="h-1 bg-slate-100">
            <div className="h-full bg-slate-900 transition-all" style={{ width: `${((stepIndex + 1) / STEPS.length) * 100}%` }} />
          </div>
        </div>

        <div className="hidden justify-end px-10 pt-6 lg:flex">
          <Link
            to="/pricing"
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
          >
            <X className="h-4 w-4" /> Exit
          </Link>
        </div>

        <main className="mx-auto max-w-5xl px-5 py-10 md:px-10 lg:py-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
            >
              {step === 'plan' && <PlanStep plan={plan} onSubmit={handlePlan} />}
              {step === 'institution' && (
                <InstitutionStep draft={draft} plan={plan} onSubmit={saveAndNext} onChangePlan={handleChangePlan} onBack={back} />
              )}
              {step === 'admin' && <AdminStep draft={draft} onSubmit={saveAndNext} onBack={back} />}
              {step === 'theme' && <ThemeStep draft={draft} onSubmit={saveAndNext} onBack={back} />}
              {step === 'review' && draft && (
                <ReviewStep draft={draft} canceled={canceled} onEdit={goTo} onCheckout={handleCheckout} onBack={back} />
              )}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
};

export default OnboardingPage;
