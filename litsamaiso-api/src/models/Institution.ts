import { model, Schema } from "mongoose";
import type { PlanKey } from "../config/plans.js";
import type { InstitutionTheme } from "../utils/themePalette.js";

/**
 * manual   – created or managed by AppAdmin outside Stripe; never auto-locked
 * active   – subscription paid up
 * grace    – payment failed or subscription ended; locks after graceEndsAt
 * canceled – locked after the grace period
 */
export type BillingStatus = "active" | "grace" | "canceled" | "manual";

export interface InstitutionBilling {
  plan?: PlanKey | undefined;
  status: BillingStatus;
  stripeCustomerId?: string | undefined;
  stripeSubscriptionId?: string | undefined;
  subscriptionStatus?: string | undefined;
  currentPeriodEnd?: Date | undefined;
  cancelAtPeriodEnd?: boolean | undefined;
  graceEndsAt?: Date | undefined;
}

export interface InstitutionDocument {
  name: string;
  email: string;
  phone?: string | undefined;
  address?: string | undefined;
  website?: string | undefined;
  country?: string | undefined;
  locked?: boolean;
  lockedReason?: string | undefined;
  lockedAt?: Date | undefined;
  /** Who applied the lock: billing locks are lifted automatically on payment. */
  lockedBy?: "manual" | "billing" | undefined;
  billing?: InstitutionBilling;
  theme?: InstitutionTheme | undefined;
  onboardedAt?: Date | undefined;
}

const billingSchema = new Schema<InstitutionBilling>(
  {
    plan: { type: String, enum: ["starter", "professional", "enterprise"] },
    status: { type: String, enum: ["active", "grace", "canceled", "manual"], default: "manual" },
    stripeCustomerId: { type: String, index: true, sparse: true },
    stripeSubscriptionId: { type: String },
    subscriptionStatus: { type: String },
    currentPeriodEnd: { type: Date },
    cancelAtPeriodEnd: { type: Boolean },
    graceEndsAt: { type: Date },
  },
  { _id: false },
);

const themeSchema = new Schema<InstitutionTheme>(
  {
    preset: { type: String, required: true },
    primary: { type: String, required: true },
    accent: { type: String, required: true },
    surface: { type: String, enum: ["light", "soft"], required: true },
    logoUrl: { type: String, trim: true },
  },
  { _id: false },
);

const institutionSchema = new Schema<InstitutionDocument>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, unique: true },
    phone: { type: String, trim: true },
    address: { type: String, trim: true },
    website: { type: String, trim: true },
    country: { type: String, trim: true },
    locked: { type: Boolean, default: false },
    lockedReason: { type: String, trim: true },
    lockedAt: { type: Date },
    lockedBy: { type: String, enum: ["manual", "billing"] },
    billing: { type: billingSchema, default: () => ({ status: "manual" }) },
    theme: { type: themeSchema },
    onboardedAt: { type: Date },
  },
  {
    timestamps: true,
  },
);

institutionSchema.index({ "billing.status": 1, "billing.graceEndsAt": 1 });

export const Institution = model<InstitutionDocument>("Institution", institutionSchema);
export default Institution;
