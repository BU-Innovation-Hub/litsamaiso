import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/authMiddleware.js";
import {
  getBranchCodes,
  getBranchCodeById,
  createBranchCode,
  updateBranchCode,
  deleteBranchCode,
  getMissingBanks,
  createMissingBanks,
} from "../controllers/branchCodeController.js";

const router = Router();

router.use(requireAuth);
router.use(requireRole(["AppAdmin", "Finance"]));

router.get("/missing-banks", getMissingBanks);
router.post("/create-missing", createMissingBanks);

router.get("/", getBranchCodes);
router.get("/:id", getBranchCodeById);
router.post("/", createBranchCode);
router.put("/:id", updateBranchCode);
router.delete("/:id", deleteBranchCode);

export default router;
