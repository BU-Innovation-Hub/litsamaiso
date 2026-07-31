import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/authMiddleware.js";
import {
  countRecipients,
  generateEmail,
  getEmailJob,
  sendEmailJob,
} from "../controllers/administrativeEmailController.js";

const router = Router();

router.use(requireAuth, requireRole("AppAdmin"));

router.get("/recipient-count", countRecipients);
router.post("/generate", generateEmail);
router.post("/send", sendEmailJob);
router.get("/jobs/:id", getEmailJob);

export default router;
