import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowRight, Check, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import PasswordInput from '@/components/ui/PasswordInput';
import type { DraftUpdate, OnboardingDraft } from '@/services/onboardingService';
import { FormField, StepActions, StepHeader } from './FormField';
import { inputClass, passwordStrength, submitWithFieldErrors } from './onboardingSteps';

const buildSchema = (hasPassword: boolean) =>
  z.object({
    name: z.string().trim().min(2, 'Enter your full name').max(120),
    title: z.string().trim().max(120).optional(),
    email: z.email('Enter a valid email address').trim(),
    password: z
      .string()
      .refine(
        (value) => (hasPassword && !value) || (value.length >= 8 && /[a-z]/i.test(value) && /\d/.test(value)),
        'At least 8 characters, including a letter and a number',
      ),
    acknowledged: z.boolean().refine((value) => value, 'Please confirm to continue'),
  });

type Values = z.infer<ReturnType<typeof buildSchema>>;

const adminCapabilities = [
  'Invite Finance, Registry and SAAD staff',
  'Import students and manage accounts',
  'View institution-wide reports',
  'Manage branding and the subscription',
];

const strengthLabels = ['Too short', 'Weak', 'Fair', 'Good', 'Strong'];
const strengthColors = ['bg-slate-200', 'bg-red-500', 'bg-amber-500', 'bg-lime-500', 'bg-emerald-600'];

interface AdminStepProps {
  draft: OnboardingDraft | null;
  onSubmit: (update: DraftUpdate) => Promise<void>;
  onBack: () => void;
}

export const AdminStep: React.FC<AdminStepProps> = ({ draft, onSubmit, onBack }) => {
  const hasPassword = Boolean(draft?.admin.hasPassword);
  const institutionName = draft?.institution.name || 'your institution';
  const schema = buildSchema(hasPassword);

  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: draft?.admin.name ?? '',
      title: draft?.admin.title ?? '',
      email: draft?.admin.email ?? '',
      password: '',
      acknowledged: draft?.acknowledgedInstitutionAdmin ?? false,
    },
  });

  const password = watch('password');
  const strength = passwordStrength(password);

  const submit = handleSubmit(async (values) => {
    await submitWithFieldErrors('admin.', ['name', 'title', 'email', 'password'], setError, () =>
      onSubmit({
        admin: {
          name: values.name,
          title: values.title || '',
          email: values.email,
          ...(values.password ? { password: values.password } : {}),
        },
        acknowledgedInstitutionAdmin: values.acknowledged,
      }),
    );
  });

  return (
    <form onSubmit={submit} noValidate>
      <StepHeader
        eyebrow="Step 3 of 5"
        title="Create the admin account"
        description="This is the account you'll use to sign in and set up your institution."
      />

      <section
        aria-labelledby="role-notice-title"
        className="mb-8 overflow-hidden rounded-3xl border border-slate-900/10 bg-slate-900 text-white shadow-lg"
      >
        <div className="flex flex-col gap-5 p-6 md:flex-row md:p-7">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10">
            <ShieldCheck className="h-6 w-6" />
          </span>
          <div className="space-y-3">
            <h2 id="role-notice-title" className="text-lg font-semibold">
              You will become the Institution Admin for {institutionName}
            </h2>
            <p className="text-sm leading-6 text-white/75">
              When payment completes, this account is created with the <strong className="text-white">Institution Admin</strong>{' '}
              role — the owner of your institution's workspace. Please use your details at the institution (for example
              your work email), not a personal account, so access stays with the institution.
            </p>
            <ul className="grid gap-2 text-sm text-white/85 sm:grid-cols-2">
              {adminCapabilities.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label="Full name" htmlFor="admin-name" error={errors.name?.message}>
          <input id="admin-name" className={inputClass} autoComplete="name" aria-invalid={Boolean(errors.name)} {...register('name')} />
        </FormField>
        <FormField label="Job title" htmlFor="admin-title" error={errors.title?.message} optional>
          <input id="admin-title" className={inputClass} placeholder="e.g. Registrar" autoComplete="organization-title" {...register('title')} />
        </FormField>
        <FormField
          label="Work email"
          htmlFor="admin-email"
          error={errors.email?.message}
          hint="You'll sign in with this email."
          className="sm:col-span-2"
        >
          <input id="admin-email" type="email" className={inputClass} autoComplete="email" aria-invalid={Boolean(errors.email)} {...register('email')} />
        </FormField>
        <FormField
          label="Password"
          htmlFor="admin-password"
          error={errors.password?.message}
          hint={hasPassword ? 'Your password is saved. Leave blank to keep it.' : undefined}
          className="sm:col-span-2"
        >
          <PasswordInput
            id="admin-password"
            className={inputClass}
            autoComplete="new-password"
            aria-invalid={Boolean(errors.password)}
            {...register('password')}
          />
          {password && (
            <div className="flex items-center gap-3 pt-1" aria-live="polite">
              <div className="flex flex-1 gap-1">
                {[1, 2, 3, 4].map((bar) => (
                  <span key={bar} className={cn('h-1.5 flex-1 rounded-full', bar <= strength ? strengthColors[strength] : 'bg-slate-200')} />
                ))}
              </div>
              <span className="w-16 text-right text-xs font-medium text-slate-500">{strengthLabels[strength]}</span>
            </div>
          )}
        </FormField>
      </div>

      <label
        className={cn(
          'mt-8 flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition',
          errors.acknowledged ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-white hover:border-slate-400',
        )}
      >
        <input type="checkbox" className="mt-1 h-4 w-4 accent-slate-900" {...register('acknowledged')} />
        <span className="text-sm leading-6 text-slate-700">
          I understand this account will be the <strong>Institution Admin</strong> for <strong>{institutionName}</strong>, and I
          am authorised to set up Litsamaiso on its behalf.
          {errors.acknowledged && (
            <span className="mt-1 block text-xs font-medium text-red-600">{errors.acknowledged.message}</span>
          )}
        </span>
      </label>

      <StepActions onBack={onBack} submitLabel="Continue" submitting={isSubmitting} icon={<ArrowRight className="h-4 w-4" />} />
    </form>
  );
};
