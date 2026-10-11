import type Stripe from "stripe";
import type { Types } from "mongoose";
import { getClientBaseUrl, getStripe } from "../config/stripe.js";
import { getBillingGraceDays, PLANS, planFromLookupKey, type PlanKey } from "../config/plans.js";
import { Institution, type InstitutionBilling, type InstitutionDocument } from "../models/Institution.js";
import { OnboardingDraft } from "../models/OnboardingDraft.js";
import { Student } from "../models/Student.js";
import AppError from "../utils/errors.js";
import { recordAudit } from "../utils/auditLog.js";
import {
  sendInstitutionWelcomeEmail,
  sendNewInstitutionAlert,
  sendOnboardingFailedAlert,
} from "../utils/email.js";
import { provisionInstitution } from "./institutionProvisioningService.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const PROVISIONING_STALE_MS = 2 * 60 * 1000;
export const BILLING_LOCK_REASON = "Subscription inactive. Renew the subscription to restore access.";

const idOf = (value: string | { id: string } | null | undefined): string | undefined =>
  typeof value === "string" ? value : value?.id;

/** Institution billing fields derived from a Stripe subscription (status excluded). */
const subscriptionFields = (subscription: Stripe.Subscription, fallbackPlan?: PlanKey) => {
  const item = subscription.items.data[0];
  const plan = planFromLookupKey(item?.price.lookup_key) ?? fallbackPlan;
  return {
    plan,
    stripeCustomerId: idOf(subscription.customer),
    stripeSubscriptionId: subscription.id,
    subscriptionStatus: subscription.status,
    currentPeriodEnd: item ? new Date(item.current_period_end * 1000) : undefined,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
  };
};

type Health = "active" | "lapsed" | "pending";

const subscriptionHealth = (status: Stripe.Subscription.Status): Health => {
  if (status === "active" || status === "trialing") return "active";
  if (status === "incomplete") return "pending";
  return "lapsed"; // past_due, unpaid, canceled, incomplete_expired, paused
};

const graceDeadline = () => new Date(Date.now() + getBillingGraceDays() * DAY_MS);

/**
 * Applies a Stripe subscription's state to the institution that owns it.
 * Safe to call repeatedly and in any order (webhooks can arrive out of order).
 */
export const applySubscription = async (
  subscription: Stripe.Subscription,
  options: { forceGrace?: boolean } = {},
) => {
  const customerId = idOf(subscription.customer);
  const institution = await Institution.findOne({
    $or: [{ "billing.stripeSubscriptionId": subscription.id }, { "billing.stripeCustomerId": customerId }],
  });
  if (!institution) return null; // Not provisioned yet; provisioning will sync it.

  const billing: InstitutionBilling = institution.billing ?? { status: "manual" };
  const health = options.forceGrace ? "lapsed" : subscriptionHealth(subscription.status);

  // Ignore stale events from an older subscription once a newer one is in place,
  // unless the incoming one is the healthy replacement.
  if (billing.stripeSubscriptionId && billing.stripeSubscriptionId !== subscription.id && health !== "active") {
    return institution;
  }
  if (health === "pending") return institution;

  const fields = subscriptionFields(subscription, billing.plan);
  const next: InstitutionBilling = { ...billing, ...fields, status: billing.status };

  // AppAdmin has taken billing over manually; record Stripe state but don't act on it.
  if (billing.status !== "manual") {
    if (health === "active") {
      next.status = "active";
      next.graceEndsAt = undefined;
      if (institution.locked && institution.lockedBy === "billing") {
        institution.locked = false;
        institution.lockedReason = undefined;
        institution.lockedAt = undefined;
        institution.lockedBy = undefined;
      }
    } else {
      next.status = subscription.status === "canceled" ? "canceled" : "grace";
      next.graceEndsAt = billing.graceEndsAt ?? graceDeadline();
    }
  }

  institution.billing = next;
  await institution.save();
  return institution;
};

/** Locks institutions whose grace period has run out. Run hourly by Agenda. */
export const enforceGracePeriods = async (now = new Date()) => {
  const result = await Institution.updateMany(
    {
      "billing.status": { $in: ["grace", "canceled"] },
      "billing.graceEndsAt": { $lte: now },
      locked: { $ne: true },
    },
    { $set: { locked: true, lockedBy: "billing", lockedReason: BILLING_LOCK_REASON, lockedAt: now } },
  );
  return result.modifiedCount;
};

// ---------- student caps ----------

export const getStudentCap = (institution: Pick<InstitutionDocument, "billing"> | null | undefined) => {
  const plan = institution?.billing?.plan;
  return plan ? PLANS[plan].studentCap : null;
};

/** Throws when adding `incoming` new students would exceed the plan's cap. */
export const assertStudentCapacity = async (institutionId: Types.ObjectId | string, incoming: number) => {
  if (incoming <= 0) return;
  const institution = await Institution.findById(institutionId).select("billing").lean();
  const cap = getStudentCap(institution);
  if (cap === null) return;

  const current = await Student.countDocuments({ institution: institutionId });
  if (current + incoming > cap) {
    const plan = PLANS[institution!.billing!.plan!];
    throw new AppError(
      `Your ${plan.name} plan allows up to ${cap.toLocaleString("en-US")} students. ` +
        `You have ${current.toLocaleString("en-US")} and are adding ${incoming.toLocaleString("en-US")}. ` +
        "Upgrade your plan from Billing to add more.",
      403,
    );
  }
};

/**
 * For bulk imports: loads the cap and current count once, then hands out
 * slots as rows are inserted. `reserve()` returns false once the cap is hit.
 */
export const createStudentCapacityGuard = async (institutionId: Types.ObjectId | string) => {
  const institution = await Institution.findById(institutionId).select("billing").lean();
  const cap = getStudentCap(institution);
  let count = cap === null ? 0 : await Student.countDocuments({ institution: institutionId });
  let rejected = 0;
  return {
    reserve: () => {
      if (cap === null || count < cap) {
        count += 1;
        return true;
      }
      rejected += 1;
      return false;
    },
    release: () => {
      if (cap !== null) count -= 1;
    },
    /** One summary line for the import report, or null if nothing was rejected. */
    summary: () =>
      rejected && cap !== null
        ? `${rejected.toLocaleString("en-US")} student(s) were not added because your ${
            PLANS[institution!.billing!.plan!].name
          } plan allows up to ${cap.toLocaleString("en-US")} students. Upgrade from Billing to add more.`
        : null,
  };
};

// ---------- provisioning after payment ----------

const retrieveCheckoutSession = (sessionId: string) =>
  getStripe().checkout.sessions.retrieve(sessionId, { expand: ["subscription"] });

/**
 * Creates the institution and InstitutionAdmin for a paid onboarding draft.
 * Called from both the webhook and the client's completion poll; an atomic
 * status claim makes sure only one of them does the work.
 */
export const provisionFromDraft = async (draftId: string, knownSession?: Stripe.Checkout.Session) => {
  const staleBefore = new Date(Date.now() - PROVISIONING_STALE_MS);
  const draft = await OnboardingDraft.findOneAndUpdate(
    {
      _id: draftId,
      $or: [{ status: "checkout" }, { status: "provisioning", provisioningStartedAt: { $lt: staleBefore } }],
    },
    { $set: { status: "provisioning", provisioningStartedAt: new Date() } },
    { new: true },
  ).select("+admin.passwordHash");

  if (!draft) return OnboardingDraft.findById(draftId); // already handled or in flight

  const institutionName = draft.institution?.name ?? "Unknown institution";
  const adminEmail = draft.admin?.email ?? "unknown";

  try {
    if (!draft.stripeCheckoutSessionId) throw new Error("Draft has no checkout session");
    const session =
      knownSession && typeof knownSession.subscription !== "string"
        ? knownSession
        : await retrieveCheckoutSession(draft.stripeCheckoutSessionId);

    if (session.id !== draft.stripeCheckoutSessionId || session.metadata?.draftId !== String(draft._id)) {
      throw new Error("Checkout session does not belong to this onboarding");
    }
    if (session.payment_status !== "paid") {
      await OnboardingDraft.updateOne({ _id: draft._id }, { $set: { status: "checkout" } });
      return draft;
    }

    const subscription =
      typeof session.subscription === "string"
        ? await getStripe().subscriptions.retrieve(session.subscription)
        : session.subscription;
    if (!subscription) throw new Error("Checkout session has no subscription");

    const { institution: details, admin, theme } = draft;
    if (!details?.name || !details.email || !admin?.email || !admin.passwordHash) {
      throw new Error("Onboarding draft is incomplete");
    }

    const fields = subscriptionFields(subscription, draft.plan);
    const { institution, admin: adminUser } = await provisionInstitution({
      institution: {
        name: details.name,
        email: details.email,
        phone: details.phone,
        address: details.address,
        website: details.website,
        country: details.country,
      },
      admin: { name: admin.name, email: admin.email, passwordHash: admin.passwordHash },
      billing: { ...fields, plan: fields.plan ?? draft.plan, status: "active" },
      theme: theme?.preset ? theme : undefined,
      onboarded: true,
    });

    await OnboardingDraft.updateOne(
      { _id: draft._id },
      {
        $set: {
          status: "provisioned",
          provisionedInstitution: institution._id,
          provisionedUser: adminUser._id,
          expiresAt: new Date(Date.now() + 7 * DAY_MS),
        },
        $unset: { "admin.passwordHash": 1, failureReason: 1 },
      },
    );

    const planName = PLANS[draft.plan].name;
    await recordAudit({
      action: "institution.onboarded",
      actorId: String(adminUser._id),
      actorEmail: adminUser.email,
      actorRole: "InstitutionAdmin",
      targetCollection: "institutions",
      targetId: String(institution._id),
      details: { plan: draft.plan, stripeSubscriptionId: subscription.id },
    });

    void sendInstitutionWelcomeEmail({
      to: adminUser.email,
      adminName: adminUser.name,
      institutionName: institution.name,
      planName,
      dashboardUrl: `${getClientBaseUrl()}/dashboard`,
    }).catch((err) => console.error("[billing] welcome email failed", err));
    void sendNewInstitutionAlert({
      institutionName: institution.name,
      institutionEmail: institution.email,
      adminName: adminUser.name,
      adminEmail: adminUser.email,
      planName,
    }).catch((err) => console.error("[billing] AppAdmin alert failed", err));

    return OnboardingDraft.findById(draft._id);
  } catch (err: any) {
    const reason = err?.message || "Unknown error";
    console.error(`[billing] provisioning failed for draft ${draftId}`, err);
    await OnboardingDraft.updateOne({ _id: draft._id }, { $set: { status: "failed", failureReason: reason } });
    void sendOnboardingFailedAlert({ institutionName, adminEmail, reason, draftId: String(draft._id) }).catch(
      (mailErr) => console.error("[billing] failure alert failed", mailErr),
    );
    return OnboardingDraft.findById(draft._id);
  }
};

/** Client-safe billing summary. */
export const serializeBilling = async (institution: InstitutionDocument & { _id: Types.ObjectId }) => {
  const billing = institution.billing ?? { status: "manual" as const };
  const cap = getStudentCap(institution);
  const students = await Student.countDocuments({ institution: institution._id });
  return {
    plan: billing.plan ?? null,
    planName: billing.plan ? PLANS[billing.plan].name : null,
    status: billing.status,
    currentPeriodEnd: billing.currentPeriodEnd ?? null,
    cancelAtPeriodEnd: Boolean(billing.cancelAtPeriodEnd),
    graceEndsAt: billing.graceEndsAt ?? null,
    hasStripeCustomer: Boolean(billing.stripeCustomerId),
    locked: Boolean(institution.locked),
    lockedBy: institution.lockedBy ?? null,
    usage: { students, studentCap: cap },
  };
};
