// Creates (or reuses) the Stripe Products and annual ZAR Prices for each plan.
// Idempotent: Prices are matched by lookup key. If an amount changes, a new
// Price takes over the lookup key and the old one is archived.
//
//   npm run stripe:sync-plans
import "dotenv/config";
import { getStripe } from "../config/stripe.js";
import { BILLING_CURRENCY, BILLING_INTERVAL, PLAN_KEYS, PLANS } from "../config/plans.js";

const run = async () => {
  const stripe = getStripe();
  const mode = process.env.STRIPE_SECRET_KEY?.startsWith("sk_live") ? "LIVE" : "test";
  console.log(`Syncing Litsamaiso plans to Stripe (${mode} mode)`);

  for (const key of PLAN_KEYS) {
    const plan = PLANS[key];
    const existing = (
      await stripe.prices.list({ lookup_keys: [plan.lookupKey], expand: ["data.product"], limit: 1 })
    ).data[0];

    const matches =
      existing &&
      existing.active &&
      existing.unit_amount === plan.amountZarCents &&
      existing.currency === BILLING_CURRENCY &&
      existing.recurring?.interval === BILLING_INTERVAL;
    if (matches) {
      console.log(`  ✓ ${plan.name}: ${existing.id} already up to date`);
      continue;
    }

    const existingProduct = existing && typeof existing.product !== "string" ? existing.product : null;
    const productId =
      existingProduct && !existingProduct.deleted
        ? existingProduct.id
        : (
            await stripe.products.create({
              name: `Litsamaiso ${plan.name}`,
              description: plan.studentCap
                ? `Annual subscription for up to ${plan.studentCap.toLocaleString("en-US")} students`
                : "Annual subscription, unlimited students",
              metadata: { plan: key },
            })
          ).id;

    const price = await stripe.prices.create({
      product: productId,
      currency: BILLING_CURRENCY,
      unit_amount: plan.amountZarCents,
      recurring: { interval: BILLING_INTERVAL },
      lookup_key: plan.lookupKey,
      transfer_lookup_key: true,
      nickname: `${plan.name} (annual, ZAR)`,
      metadata: { plan: key },
    });
    if (existing?.active) await stripe.prices.update(existing.id, { active: false });

    console.log(`  + ${plan.name}: created ${price.id} (R${plan.amountZarCents / 100}/${BILLING_INTERVAL})`);
  }
};

run().catch((error) => {
  console.error(error?.message ?? error);
  process.exitCode = 1;
});
