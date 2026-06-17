import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/authMiddleware.js";
import { listAdminIssues, getAdminIssue, approveIssue, rejectIssue } from "../controllers/adminIssueController.js";

const router = Router();

router.get("/", requireAuth, requireRole("Finance"), listAdminIssues);
router.get("/:id", requireAuth, requireRole("Finance"), getAdminIssue);
router.put("/:id/approve", requireAuth, requireRole("Finance"), approveIssue);
router.put("/:id/reject", requireAuth, requireRole("Finance"), rejectIssue);

export default router;
