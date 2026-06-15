import { Router } from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import { listIssuesForStudent, createIssue, deleteIssuesForStudent } from "../controllers/issueController.js";

const router = Router();

router.get("/", requireAuth, listIssuesForStudent);
router.post("/", requireAuth, createIssue);
router.delete("/", requireAuth, deleteIssuesForStudent);

export default router;
