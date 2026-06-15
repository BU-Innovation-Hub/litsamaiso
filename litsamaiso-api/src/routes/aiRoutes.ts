import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/authMiddleware.js";
import { validateAccount } from "../controllers/aiController.js";

const router = Router();

// Allow larger JSON payloads for base64 images
router.post("/validate-account", requireAuth, requireRole("Student"), validateAccount);

export default router;
