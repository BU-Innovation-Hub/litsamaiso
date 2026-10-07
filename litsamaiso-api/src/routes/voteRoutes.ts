import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/authMiddleware.js";
import { createRateLimit } from "../middleware/rateLimit.js";
import {
  getVoteStatusHandler,
  getVoteReceiptHandler,
} from "../controllers/voteController.js";
// Router for vote status and receipt lookups; ballots are cast via POST /elections/:electionId/vote
const router = Router();

router.use(requireAuth);

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
