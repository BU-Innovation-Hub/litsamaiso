import type { Request, Response } from "express";
import type Stripe from "stripe";
import { getStripe } from "../config/stripe.js";
import { StripeEvent } from "../models/StripeEvent.js";
import { applySubscription, provisionFromDraft } from "../services/billingService.js";

const subscriptionIdOf = (invoice: Stripe.Invoice): string | undefined => {
  const subscription = invoice.parent?.subscription_details?.subscription;
  return typeof subscription === "string" ? subscription : subscription?.id;
};

const handleEvent = async (event: Stripe.Event) => {
  const stripe = getStripe();

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      if (session.metadata?.draftId) {
        await provisionFromDraft(session.metadata.draftId, session);
      } else if (session.metadata?.institutionId && typeof session.subscription === "string") {
        // Renewal after a lapsed subscription (see billingController.renewSubscription).
        await applySubscription(await stripe.subscriptions.retrieve(session.subscription));
      }
      return;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await applySubscription(event.data.object);
      return;
    case "invoice.paid":
    case "invoice.payment_failed": {
      const subscriptionId = subscriptionIdOf(event.data.object);
      if (!subscriptionId) return;
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      await applySubscription(subscription, { forceGrace: event.type === "invoice.payment_failed" });
      return;
    }
    default:
      return;
  }
};

// POST /api/v1/webhooks/stripe — mounted with a raw body parser in index.ts.
export const stripeWebhook = async (req: Request, res: Response): Promise<void> => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = req.header("stripe-signature");
  if (!secret || !signature || !Buffer.isBuffer(req.body)) {
    res.status(400).json({ message: "Webhook not configured or signature missing" });
    return;
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(req.body, signature, secret);
  } catch (err: any) {
    res.status(400).json({ message: `Invalid signature: ${err?.message ?? "unknown"}` });
    return;
  }

  if (await StripeEvent.exists({ eventId: event.id })) {
    res.json({ received: true, duplicate: true });
    return;
  }

  try {
    await handleEvent(event);
    // Recorded only after success, so Stripe's retry reprocesses failures.
    await StripeEvent.create({ eventId: event.id, type: event.type }).catch(() => undefined);
    res.json({ received: true });
  } catch (err) {
    console.error(`[stripe] failed to handle ${event.type} ${event.id}`, err);
    res.status(500).json({ message: "Webhook handling failed" });
  }
};
