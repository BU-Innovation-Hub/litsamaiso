import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/authMiddleware.js";
import {
  getSingleAccountReport,
  listAccountReports,
} from "../controllers/reportController.js";

const router = Router();

router.use(requireAuth);
router.use(requireRole(["AppAdmin", "InstitutionAdmin", "Finance"]));

router.get("/accounts", listAccountReports);
router.get("/accounts/:reportKey", getSingleAccountReport);

export default router;
