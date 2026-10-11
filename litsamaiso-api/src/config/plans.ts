// Subscription plans. This is the source of truth for amounts and student caps;
// the client's src/config/plans.ts mirrors it for display.
//
// Stripe charges in ZAR. The Loti is pegged 1:1 to the Rand, so the Maluti
// prices shown to customers equal the ZAR amounts charged here.

export type PlanKey = "starter" | "professional" | "enterprise";

export interface Plan {
  key: PlanKey;
  name: string;
  amountZarCents: number;
  /** Maximum number of students; null means unlimited. */
  studentCap: number | null;
  /** Stripe Price lookup key; Prices are created by `npm run stripe:sync-plans`. */
  lookupKey: string;
}

export const BILLING_CURRENCY = "zar";
export const BILLING_INTERVAL = "year" as const;

export const PLANS: Record<PlanKey, Plan> = {
  starter: {
    key: "starter",
    name: "Starter",
    amountZarCents: 75_000_00,
    studentCap: 2_000,
    lookupKey: "litsamaiso_starter_annual_zar",
  },
  professional: {
    key: "professional",
    name: "Professional",
    amountZarCents: 120_000_00,
    studentCap: 10_000,
    lookupKey: "litsamaiso_professional_annual_zar",
  },
  enterprise: {
    key: "enterprise",
    name: "Enterprise",
    amountZarCents: 150_000_00,
    studentCap: null,
    lookupKey: "litsamaiso_enterprise_annual_zar",
  },
};

export const PLAN_KEYS = Object.keys(PLANS) as PlanKey[];

export const isPlanKey = (value: unknown): value is PlanKey =>
  typeof value === "string" && (PLAN_KEYS as string[]).includes(value);

export const planFromLookupKey = (lookupKey: string | null | undefined): PlanKey | undefined =>
  PLAN_KEYS.find((key) => PLANS[key].lookupKey === lookupKey);

export const getBillingGraceDays = (): number => {
  const parsed = Number(process.env.BILLING_GRACE_DAYS);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 14;
};
