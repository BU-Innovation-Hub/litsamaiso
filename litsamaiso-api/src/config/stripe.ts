import Stripe from "stripe";
import AppError from "../utils/errors.js";
import { PLANS, type PlanKey } from "./plans.js";

let client: Stripe | null = null;

export const isStripeConfigured = (): boolean => Boolean(process.env.STRIPE_SECRET_KEY);

export const getStripe = (): Stripe => {
  if (client) return client;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new AppError("Payments are not configured. Set STRIPE_SECRET_KEY.", 503);
  }
  client = new Stripe(key, { appInfo: { name: "Litsamaiso" } });
  return client;
};

export const getClientBaseUrl = (): string =>
  (process.env.CLIENT_BASE_URL || "http://localhost:5173").replace(/\/$/, "");

const priceCache = new Map<PlanKey, string>();

/** Resolves a plan's Stripe Price id by lookup key (cached per process). */
export const getPriceId = async (plan: PlanKey): Promise<string> => {
  const cached = priceCache.get(plan);
  if (cached) return cached;

  const { lookupKey } = PLANS[plan];
  const prices = await getStripe().prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 });
  const price = prices.data[0];
  if (!price) {
    throw new AppError(
      `No active Stripe price for plan "${plan}". Run \`npm run stripe:sync-plans\`.`,
      503,
    );
  }
  priceCache.set(plan, price.id);
  return price.id;
};
