import { toast } from 'sonner';
import { toFieldError, type OnboardingDraft } from '../../services/onboardingService';

export type StepId = 'plan' | 'institution' | 'admin' | 'theme' | 'review';

export const STEPS: { id: StepId; title: string; description: string }[] = [
  { id: 'plan', title: 'Choose a plan', description: 'Sized to your student body' },
  { id: 'institution', title: 'Your institution', description: 'Who you are' },
  { id: 'admin', title: 'Admin account', description: 'Your Institution Admin login' },
  { id: 'theme', title: 'Make it yours', description: 'Colours for your workspace' },
  { id: 'review', title: 'Review & pay', description: 'Secure checkout with Stripe' },
];

export const isStepComplete = (step: StepId, draft: OnboardingDraft | null): boolean => {
  if (!draft) return false;
  switch (step) {
    case 'plan':
      return true;
    case 'institution':
      return Boolean(draft.institution.name && draft.institution.email);
    case 'admin':
      return Boolean(draft.admin.name && draft.admin.email && draft.admin.hasPassword && draft.acknowledgedInstitutionAdmin);
    case 'theme':
      return Boolean(draft.theme);
    case 'review':
      return false;
  }
};

export const firstIncompleteStep = (draft: OnboardingDraft): StepId =>
  STEPS.find((step) => !isStepComplete(step.id, draft))?.id ?? 'review';

/** 0–4 password strength score for the meter. */
export const passwordStrength = (password: string): number => {
  if (!password) return 0;
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password) && /[^a-zA-Z0-9]/.test(password)) score += 1;
  return score;
};

export const inputClass =
  'w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 aria-invalid:border-red-400 aria-invalid:ring-red-100';

/**
 * Runs a step's save and maps an API `{ field, message }` error onto the
 * matching form field (e.g. "institution.email" -> "email"); anything else
 * becomes a toast. Returns true when the save succeeded.
 */
export const submitWithFieldErrors = async <F extends string>(
  prefix: string,
  fields: readonly string[],
  setError: (name: F, error: { message: string }) => void,
  save: () => Promise<void>,
): Promise<boolean> => {
  try {
    await save();
    return true;
  } catch (error) {
    const { field, message } = toFieldError(error);
    const name = field?.startsWith(prefix) ? field.slice(prefix.length) : undefined;
    if (name && fields.includes(name)) setError(name as F, { message });
    else toast.error(message);
    return false;
  }
};
