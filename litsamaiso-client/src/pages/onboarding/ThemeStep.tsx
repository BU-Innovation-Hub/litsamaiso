import React, { useState } from 'react';
import { toast } from 'sonner';
import { ArrowRight } from 'lucide-react';
import { ThemePicker } from '@/theme/ThemePicker';
import { WorkspacePreview } from '@/theme/WorkspacePreview';
import { defaultTheme, validateTheme, type InstitutionTheme } from '@/theme/palette';
import { toFieldError, type DraftUpdate, type OnboardingDraft } from '@/services/onboardingService';
import { StepActions, StepHeader } from './FormField';

interface ThemeStepProps {
  draft: OnboardingDraft | null;
  onSubmit: (update: DraftUpdate) => Promise<void>;
  onBack: () => void;
}

export const ThemeStep: React.FC<ThemeStepProps> = ({ draft, onSubmit, onBack }) => {
  const [theme, setTheme] = useState<InstitutionTheme>(draft?.theme ?? defaultTheme());
  const [submitting, setSubmitting] = useState(false);
  const valid = validateTheme(theme).length === 0;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await onSubmit({ theme });
    } catch (error) {
      toast.error(toFieldError(error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <StepHeader
        eyebrow="Step 4 of 5"
        title="Make the workspace yours"
        description="Choose how Litsamaiso looks for your staff and students once they sign in. You can change this, and add your logo, any time from Settings → Branding."
      />
      <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <ThemePicker value={theme} onChange={setTheme} />
        <div className="xl:sticky xl:top-8 xl:self-start">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Live preview</p>
          <WorkspacePreview theme={theme} institutionName={draft?.institution.name} />
          <dl className="mt-4 grid grid-cols-3 gap-2 text-xs text-slate-600">
            <div className="rounded-xl bg-white p-3 shadow-sm">
              <dt className="font-semibold text-slate-900">60%</dt>
              <dd>Background & cards</dd>
            </div>
            <div className="rounded-xl bg-white p-3 shadow-sm">
              <dt className="font-semibold text-slate-900">30%</dt>
              <dd>Sidebar & headings</dd>
            </div>
            <div className="rounded-xl bg-white p-3 shadow-sm">
              <dt className="font-semibold text-slate-900">10%</dt>
              <dd>Buttons & highlights</dd>
            </div>
          </dl>
        </div>
      </div>
      <StepActions
        onBack={onBack}
        submitLabel="Continue"
        submitting={submitting}
        disabled={!valid}
        icon={<ArrowRight className="h-4 w-4" />}
      />
    </form>
  );
};
