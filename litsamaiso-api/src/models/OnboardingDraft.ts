import { model, Schema, type Types } from "mongoose";
import type { PlanKey } from "../config/plans.js";
import type { InstitutionTheme } from "../utils/themePalette.js";

export type OnboardingStatus = "draft" | "checkout" | "provisioning" | "provisioned" | "failed";

export interface OnboardingDraftDocument {
  plan: PlanKey;
  institution?: {
    name?: string;
    email?: string;
    phone?: string;
    address?: string;
    website?: string;
    country?: string;
    expectedStudents?: number;
  };
  admin?: {
    name?: string;
    email?: string;
    title?: string;
    passwordHash?: string;
  };
  theme?: InstitutionTheme;
  acknowledgedInstitutionAdminAt?: Date;
  resumeTokenHash: string;
  status: OnboardingStatus;
  stripeCustomerId?: string;
  stripeCheckoutSessionId?: string;
  provisioningStartedAt?: Date;
  failureReason?: string;
  provisionedInstitution?: Types.ObjectId;
  provisionedUser?: Types.ObjectId;
  /** The one-time session hand-off after payment has been used. */
  sessionClaimedAt?: Date;
  expiresAt: Date;
}

const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const onboardingDraftSchema = new Schema<OnboardingDraftDocument>(
  {
    plan: { type: String, enum: ["starter", "professional", "enterprise"], required: true },
    institution: {
      name: { type: String, trim: true },
      email: { type: String, trim: true, lowercase: true },
      phone: { type: String, trim: true },
      address: { type: String, trim: true },
      website: { type: String, trim: true },
      country: { type: String, trim: true },
      expectedStudents: { type: Number, min: 0 },
    },
    admin: {
      name: { type: String, trim: true },
      email: { type: String, trim: true, lowercase: true },
      title: { type: String, trim: true },
      passwordHash: { type: String, select: false },
    },
    theme: {
      preset: String,
      primary: String,
      accent: String,
      surface: { type: String, enum: ["light", "soft"] },
      logoUrl: String,
    },
    acknowledgedInstitutionAdminAt: { type: Date },
    resumeTokenHash: { type: String, required: true, select: false },
    status: {
      type: String,
      enum: ["draft", "checkout", "provisioning", "provisioned", "failed"],
      default: "draft",
      index: true,
    },
    stripeCustomerId: { type: String },
    stripeCheckoutSessionId: { type: String, index: true, sparse: true },
    provisioningStartedAt: { type: Date },
    failureReason: { type: String },
    provisionedInstitution: { type: Schema.Types.ObjectId, ref: "Institution" },
    provisionedUser: { type: Schema.Types.ObjectId, ref: "User" },
    sessionClaimedAt: { type: Date },
    // Unpaid drafts are removed by the TTL index; paid ones have it cleared.
    expiresAt: { type: Date, default: () => new Date(Date.now() + DRAFT_TTL_MS) },
  },
  { timestamps: true },
);

onboardingDraftSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const OnboardingDraft = model<OnboardingDraftDocument>("OnboardingDraft", onboardingDraftSchema);
export default OnboardingDraft;
