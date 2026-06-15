import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/authMiddleware.js";
import { createRateLimit } from "../middleware/rateLimit.js";
import {
  submitVoteHandler,
  getVoteStatusHandler,
  getVoteReceiptHandler,
} from "../controllers/voteController.js";
// Router for vote-related endpoints, including submitting votes, checking voting status, and retrieving vote receipts
const router = Router();

router.use(requireAuth);

router.post(
  "/submit",
  requireRole("Student"),
  createRateLimit({ windowMs: 60 * 1000, max: 5, keyPrefix: "vote" }),
  submitVoteHandler,
);

router.get(
  "/status",
  requireRole("Student"),
  createRateLimit({ windowMs: 60 * 1000, max: 30, keyPrefix: "vote-status" }),
  getVoteStatusHandler,
);

router.get(
  "/receipt/:id",
  requireRole(["Student", "SAAD"]),
  createRateLimit({ windowMs: 60 * 1000, max: 30, keyPrefix: "vote-receipt" }),
  getVoteReceiptHandler,
);

export default router;
