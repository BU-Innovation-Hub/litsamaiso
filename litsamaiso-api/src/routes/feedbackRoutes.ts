import { Router } from "express";
import { getFeedbackStatus, submitFeedback, listFeedback } from "../controllers/feedbackController.js";
import { requireAuth, requireRole } from "../middleware/authMiddleware.js";

const router = Router();

router.get("/status", requireAuth, getFeedbackStatus);
router.post("/", requireAuth, submitFeedback);

// AppAdmin can list feedback
router.get("/", requireAuth, requireRole("AppAdmin"), listFeedback);

export default router;
