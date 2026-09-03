import { Router } from "express";
import multer from "multer";
import { requireAuth, requireRole } from "../middleware/authMiddleware.js";
import { uploadStudents } from "../controllers/studentController.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Protected route: AppAdmin (any institution) and InstitutionAdmin (own institution)
router.post(
  "/upload",
  requireAuth,
  requireRole(["AppAdmin", "InstitutionAdmin"]),
  upload.single("file"),
  uploadStudents,
);

export default router;
