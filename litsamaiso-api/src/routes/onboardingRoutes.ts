import { Router } from "express";
import { createRateLimit } from "../middleware/rateLimit.js";
import {
  completeOnboarding,
  createDraft,
  getDraft,
  startCheckout,
  updateDraft,
} from "../controllers/onboardingController.js";

const router = Router();

const FIFTEEN_MINUTES = 15 * 60 * 1000;
const onboardingLimit = createRateLimit({
  windowMs: FIFTEEN_MINUTES,
  max: Number(process.env.ONBOARDING_RATE_LIMIT_MAX) || 60,
  keyPrefix: "onboarding",
});
// The success page polls while the payment is confirmed, so allow more.
const completionLimit = createRateLimit({ windowMs: FIFTEEN_MINUTES, max: 150, keyPrefix: "onboarding-complete" });

// Public: institutions onboard before they have an account. Drafts are
// protected by a resume token sent in the X-Onboarding-Token header.
router.post("/drafts", onboardingLimit, createDraft);
router.get("/drafts/:id", onboardingLimit, getDraft);
router.patch("/drafts/:id", onboardingLimit, updateDraft);
router.post("/drafts/:id/checkout", onboardingLimit, startCheckout);
router.post("/complete", completionLimit, completeOnboarding);

export default router;
