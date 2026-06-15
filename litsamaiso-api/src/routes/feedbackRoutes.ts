import { Router } from "express";
import { submitFeedback, listFeedback } from "../controllers/feedbackController.js";
import { requireAuth, requireRole } from "../middleware/authMiddleware.js";

const router = Router();

// Public endpoint for submitting feedback
router.post("/", submitFeedback);

// AppAdmin can list feedback
router.get("/", requireAuth, requireRole("AppAdmin"), listFeedback);

export default router;
