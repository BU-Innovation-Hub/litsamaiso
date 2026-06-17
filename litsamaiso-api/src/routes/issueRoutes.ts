import { Router } from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import { listIssuesForStudent, createIssue, deleteIssuesForStudent, getIssueById, updateIssueById } from "../controllers/issueController.js";

const router = Router();

router.get("/", requireAuth, listIssuesForStudent);
router.post("/", requireAuth, createIssue);
router.delete("/", requireAuth, deleteIssuesForStudent);

// Individual issue endpoints
router.get("/:id", requireAuth, getIssueById);
router.put("/:id", requireAuth, updateIssueById);

export default router;
