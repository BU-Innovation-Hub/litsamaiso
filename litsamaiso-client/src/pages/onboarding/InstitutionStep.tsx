import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { PLANS, getPlan } from '@/config/plans';
import type { PlanKey } from '@/types';
import type { DraftUpdate, OnboardingDraft } from '@/services/onboardingService';
import { FormField, StepActions, StepHeader } from './FormField';
import { inputClass, submitWithFieldErrors } from './onboardingSteps';

const schema = z.object({
  name: z.string().trim().min(2, 'Enter your institution’s name').max(120),
  email: z.email('Enter a valid email address').trim(),
  phone: z.string().trim().max(40).optional(),
  country: z.string().trim().max(80).optional(),
  address: z.string().trim().max(300).optional(),
  website: z
    .string()
    .trim()
    .max(200)
    .refine((value) => !value || /^(https?:\/\/)?[\w-]+(\.[\w-]+)+\S*$/i.test(value), 'Enter a valid website')
    .optional(),
  expectedStudents: z
    .string()
    .trim()
    .refine((value) => !value || /^\d+$/.test(value), 'Enter a whole number')
    .optional(),
});

type Values = z.infer<typeof schema>;

interface InstitutionStepProps {
  draft: OnboardingDraft | null;
  plan: PlanKey;
  onSubmit: (update: DraftUpdate) => Promise<void>;
  onChangePlan: (plan: PlanKey) => Promise<void>;
  onBack: () => void;
}

export const InstitutionStep: React.FC<InstitutionStepProps> = ({
  draft,
  plan,
  onSubmit,
  onChangePlan,
  onBack,
}) => {
  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: draft?.institution.name ?? '',
      email: draft?.institution.email ?? '',
      phone: draft?.institution.phone ?? '',
      country: draft?.institution.country || 'Lesotho',
      address: draft?.institution.address ?? '',
      website: draft?.institution.website ?? '',
      expectedStudents: draft?.institution.expectedStudents?.toString() ?? '',
    },
  });

  const currentPlan = getPlan(plan);
  const expected = Number(watch('expectedStudents') || 0);
  const overCap = currentPlan.studentCap !== null && expected > currentPlan.studentCap;
  const suggested = PLANS.find((item) => item.studentCap === null || item.studentCap >= expected);

  const submit = handleSubmit(async (values) => {
    await submitWithFieldErrors('institution.', Object.keys(schema.shape), setError, () => onSubmit({
      institution: {
        name: values.name,
        email: values.email,
        phone: values.phone || '',
        country: values.country || '',
        address: values.address || '',
        website: values.website || '',
        expectedStudents: values.expectedStudents ? Number(values.expectedStudents) : null,
      },
    }));
  });

  return (
    <form onSubmit={submit} noValidate>
      <StepHeader
        eyebrow="Step 2 of 5"
        title="Tell us about your institution"
        description="These details identify your institution on Litsamaiso and appear on your invoices."
      />
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label="Institution name" htmlFor="inst-name" error={errors.name?.message} className="sm:col-span-2">
          <input id="inst-name" className={inputClass} placeholder="e.g. Maseru Technical College" autoComplete="organization" aria-invalid={Boolean(errors.name)} {...register('name')} />
        </FormField>
        <FormField
          label="Official email"
          htmlFor="inst-email"
          error={errors.email?.message}
          hint="A shared institutional address, e.g. registrar@college.ac.ls"
        >
          <input id="inst-email" type="email" className={inputClass} autoComplete="email" aria-invalid={Boolean(errors.email)} {...register('email')} />
        </FormField>
        <FormField label="Phone" htmlFor="inst-phone" error={errors.phone?.message} optional>
          <input id="inst-phone" type="tel" className={inputClass} placeholder="+266 ..." autoComplete="tel" {...register('phone')} />
        </FormField>
        <FormField label="Country" htmlFor="inst-country" error={errors.country?.message} optional>
          <input id="inst-country" className={inputClass} autoComplete="country-name" {...register('country')} />
        </FormField>
        <FormField label="Website" htmlFor="inst-website" error={errors.website?.message} optional>
          <input id="inst-website" className={inputClass} placeholder="www.college.ac.ls" autoComplete="url" aria-invalid={Boolean(errors.website)} {...register('website')} />
        </FormField>
        <FormField label="Address" htmlFor="inst-address" error={errors.address?.message} optional className="sm:col-span-2">
          <input id="inst-address" className={inputClass} autoComplete="street-address" {...register('address')} />
        </FormField>
        <FormField
          label="Approximate number of students"
          htmlFor="inst-students"
          error={errors.expectedStudents?.message}
          optional
          hint="Helps us check the plan fits."
        >
          <input id="inst-students" inputMode="numeric" className={inputClass} aria-invalid={Boolean(errors.expectedStudents)} {...register('expectedStudents')} />
        </FormField>
      </div>

      {overCap && suggested && (
        <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {currentPlan.name} covers up to {currentPlan.studentCap?.toLocaleString('en-US')} students. {suggested.name} is a
            better fit for {expected.toLocaleString('en-US')}.
          </p>
          <button
            type="button"
            onClick={() => onChangePlan(suggested.key)}
            className="shrink-0 rounded-full bg-amber-900 px-4 py-2 font-semibold text-white"
          >
            Switch to {suggested.name}
          </button>
        </div>
      )}

      <StepActions onBack={onBack} submitLabel="Continue" submitting={isSubmitting} icon={<ArrowRight className="h-4 w-4" />} />
    </form>
  );
};
