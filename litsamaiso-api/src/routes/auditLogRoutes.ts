import { Router } from "express";
import * as auditLogController from "../controllers/auditLogController.js";
import { requireAuth, requireRole } from "../middleware/authMiddleware.js";

const router = Router();

router.use(requireAuth);

router.get(
  "/",
  requireRole("AppAdmin"),
  auditLogController.listAuditLogs,
);

router.get(
  "/export",
  requireRole("AppAdmin"),
  auditLogController.exportAuditLogs,
);

export default router;
