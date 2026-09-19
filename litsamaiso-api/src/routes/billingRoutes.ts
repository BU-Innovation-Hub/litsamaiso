import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/authMiddleware.js";
import { createRateLimit } from "../middleware/rateLimit.js";
import {
  createPortalSession,
  getBillingStatus,
  renewSubscription,
} from "../controllers/billingController.js";

const router = Router();

const renewLimit = createRateLimit({ windowMs: 15 * 60 * 1000, max: 10, keyPrefix: "billing-renew" });

// Public: the admin of an institution locked for non-payment can't sign in.
router.post("/renew", renewLimit, renewSubscription);

router.get("/status", requireAuth, requireRole(["InstitutionAdmin", "AppAdmin"]), getBillingStatus);
router.post("/portal", requireAuth, requireRole("InstitutionAdmin"), createPortalSession);

export default router;
