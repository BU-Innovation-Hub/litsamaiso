import { model, Schema } from "mongoose";

// Records processed Stripe webhook events so redeliveries are skipped.
export interface StripeEventDocument {
  eventId: string;
  type: string;
  processedAt: Date;
}

const stripeEventSchema = new Schema<StripeEventDocument>({
  eventId: { type: String, required: true, unique: true },
  type: { type: String, required: true },
  processedAt: { type: Date, default: () => new Date() },
});

// Stripe stops retrying after a few days; keep a comfortable margin.
stripeEventSchema.index({ processedAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });

export const StripeEvent = model<StripeEventDocument>("StripeEvent", stripeEventSchema);
export default StripeEvent;
