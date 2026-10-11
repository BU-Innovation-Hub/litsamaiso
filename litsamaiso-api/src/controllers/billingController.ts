import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { isValidObjectId } from "mongoose";
import { Institution } from "../models/Institution.js";
import { User } from "../models/User.js";
import { isPlanKey, PLANS } from "../config/plans.js";
import { getClientBaseUrl, getPriceId, getStripe } from "../config/stripe.js";
import AppError from "../utils/errors.js";
import { recordAudit } from "../utils/auditLog.js";
import { applySubscription, serializeBilling } from "../services/billingService.js";

const roleOf = (user: any) => String(user?.role?.name || user?.role || "").toLowerCase();

const handleError = (res: Response, err: unknown) => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ message: err.message });
    return;
  }
  console.error("[billing]", err);
  res.status(500).json({ message: "Something went wrong. Please try again." });
};

/** InstitutionAdmin: their own institution. AppAdmin: ?institutionId. */
const resolveInstitutionId = (req: Request) => {
  const user = (req as any).user;
  if (roleOf(user) === "appadmin") {
    const id = req.query.institutionId;
    if (typeof id !== "string" || !isValidObjectId(id)) throw new AppError("institutionId is required");
    return id;
  }
  return String(user.institution);
};

const billingReturnUrl = () => `${getClientBaseUrl()}/settings/billing`;

// GET /billing/status
export const getBillingStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const institution = await Institution.findById(resolveInstitutionId(req));
    if (!institution) throw new AppError("Institution not found", 404);
    res.json({ billing: await serializeBilling(institution) });
  } catch (err) {
    handleError(res, err);
  }
};

// POST /billing/portal — Stripe Customer Portal (card, invoices, plan changes, cancellation).
export const createPortalSession = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    const institution = await Institution.findById(user.institution);
    const customer = institution?.billing?.stripeCustomerId;
    if (!customer) {
      throw new AppError("Billing for your institution is managed by Litsamaiso. Contact support for changes.", 409);
    }
    const session = await getStripe().billingPortal.sessions.create({ customer, return_url: billingReturnUrl() });
    res.json({ url: session.url });
  } catch (err) {
    handleError(res, err);
  }
};

/**
 * POST /billing/renew — public. Lets the InstitutionAdmin of an institution
 * locked for non-payment renew without being able to sign in.
 */
export const renewSubscription = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = (req.body ?? {}) as { email?: unknown; password?: unknown };
    if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
      throw new AppError("Email and password are required");
    }

    const user = await User.findOne({ email: email.trim().toLowerCase() }).select("+password").populate("role", "name");
    const valid = user ? await bcrypt.compare(password, user.password) : false;
    if (!user || !valid || roleOf(user) !== "institutionadmin") {
      throw new AppError("Invalid credentials, or this account is not an Institution Admin.", 401);
    }

    const institution = await Institution.findById(user.institution);
    const billing = institution?.billing;
    if (!institution || !billing?.stripeCustomerId || billing.status === "manual") {
      throw new AppError("Your institution's billing is managed by Litsamaiso. Please contact support.", 409);
    }

    const stripe = getStripe();
    const subscriptionId = billing.stripeSubscriptionId;
    const subscription = subscriptionId ? await stripe.subscriptions.retrieve(subscriptionId) : null;
    const ended = !subscription || ["canceled", "incomplete_expired"].includes(subscription.status);

    if (!ended) {
      // Still recoverable (e.g. past_due): update the card and pay the open invoice.
      const portal = await stripe.billingPortal.sessions.create({
        customer: billing.stripeCustomerId,
        return_url: `${getClientBaseUrl()}/login?renewed=1`,
      });
      res.json({ url: portal.url });
      return;
    }

    const plan = billing.plan ?? "professional";
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: billing.stripeCustomerId,
      line_items: [{ price: await getPriceId(plan), quantity: 1 }],
      success_url: `${getClientBaseUrl()}/login?renewed=1`,
      cancel_url: `${getClientBaseUrl()}/locked`,
      metadata: { institutionId: String(institution._id), plan },
      subscription_data: {
        description: `Litsamaiso ${PLANS[plan].name} — ${institution.name}`,
        metadata: { institutionId: String(institution._id), plan },
      },
    });
    res.json({ url: session.url });
  } catch (err) {
    handleError(res, err);
  }
};

/**
 * PATCH /institutions/:id/billing — AppAdmin override.
 * { manual: true, plan? } takes billing out of Stripe's hands (and lifts a billing lock);
 * { manual: false } hands it back to the Stripe subscription.
 */
export const overrideBilling = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    if (typeof id !== "string" || !isValidObjectId(id)) throw new AppError("Institution not found", 404);
    const institution = await Institution.findById(id);
    if (!institution) throw new AppError("Institution not found", 404);

    const { manual, plan } = (req.body ?? {}) as { manual?: unknown; plan?: unknown };
    if (typeof manual !== "boolean") throw new AppError("manual must be true or false");
    if (plan !== undefined && plan !== null && !isPlanKey(plan)) throw new AppError("Unknown plan");

    const billing = { ...(institution.billing ?? { status: "manual" as const }) };
    if (plan !== undefined) billing.plan = plan === null ? undefined : plan;

    if (manual) {
      billing.status = "manual";
      billing.graceEndsAt = undefined;
      if (institution.locked && institution.lockedBy === "billing") {
        institution.locked = false;
        institution.lockedReason = undefined;
        institution.lockedAt = undefined;
        institution.lockedBy = undefined;
      }
      institution.billing = billing;
      await institution.save();
    } else {
      if (!billing.stripeSubscriptionId) {
        throw new AppError("This institution has no Stripe subscription to hand billing back to.", 409);
      }
      billing.status = "active";
      institution.billing = billing;
      await institution.save();
      await applySubscription(await getStripe().subscriptions.retrieve(billing.stripeSubscriptionId));
    }

    const actor = (req as any).user;
    await recordAudit({
      action: "institution.billing.override",
      actorId: String(actor?._id),
      actorEmail: actor?.email,
      actorRole: "AppAdmin",
      targetCollection: "institutions",
      targetId: String(institution._id),
      details: { manual, plan: plan ?? undefined },
    });

    const updated = await Institution.findById(id);
    res.json({ institution: updated, billing: await serializeBilling(updated!) });
  } catch (err) {
    handleError(res, err);
  }
};
