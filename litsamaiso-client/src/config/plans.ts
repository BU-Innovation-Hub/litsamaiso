import type { PlanKey } from '../types';

// Display copy for the pricing page and onboarding. Amounts and caps are
// enforced by the API (litsamaiso-api/src/config/plans.ts) — keep in sync.
//
// Stripe charges in ZAR; Maluti is pegged 1:1 to the Rand, so the "M" price
// shown here is cosmetic and equals the ZAR amount charged.

export interface PlanDisplay {
  key: PlanKey;
  name: string;
  priceLsl: number;
  studentCap: number | null;
  tagline: string;
  highlights: string[];
  popular?: boolean;
}

export const PLANS: PlanDisplay[] = [
  {
    key: 'starter',
    name: 'Starter',
    priceLsl: 75_000,
    studentCap: 2_000,
    tagline: 'For colleges and smaller institutions digitising student support.',
    highlights: [
      'Up to 2,000 students',
      'Every Litsamaiso module included',
      'Unlimited staff accounts',
      'Branded workspace',
    ],
  },
  {
    key: 'professional',
    name: 'Professional',
    priceLsl: 120_000,
    studentCap: 10_000,
    tagline: 'For growing institutions running multiple support teams.',
    highlights: [
      'Up to 10,000 students',
      'Every Litsamaiso module included',
      'Unlimited staff accounts',
      'Branded workspace',
    ],
    popular: true,
  },
  {
    key: 'enterprise',
    name: 'Enterprise',
    priceLsl: 150_000,
    studentCap: null,
    tagline: 'For universities operating at national scale.',
    highlights: [
      'Unlimited students',
      'Every Litsamaiso module included',
      'Unlimited staff accounts',
      'Branded workspace',
    ],
  },
];

export const PLAN_KEYS = PLANS.map((plan) => plan.key);

export const isPlanKey = (value: unknown): value is PlanKey =>
  typeof value === 'string' && (PLAN_KEYS as string[]).includes(value);

export const getPlan = (key: PlanKey | undefined | null): PlanDisplay =>
  PLANS.find((plan) => plan.key === key) ?? PLANS[1];

const amount = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 0 });

/** "M75,000" – Maluti display price. */
export const formatMaluti = (value: number) => `M${amount(value)}`;

/** "R75,000" – the ZAR amount Stripe actually charges. */
export const formatRand = (value: number) => `R${amount(value)}`;

export const formatStudentCap = (cap: number | null) =>
  cap === null ? 'Unlimited students' : `Up to ${amount(cap)} students`;
