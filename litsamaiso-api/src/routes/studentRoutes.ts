import { Router } from "express";
import multer from "multer";
import { requireAuth, requireRole } from "../middleware/authMiddleware.js";
import { uploadStudents } from "../controllers/studentController.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Protected route: only InstitutionAdmin may upload students
router.post(
  "/upload",
  requireAuth,
  requireRole("InstitutionAdmin"),
  upload.single("file"),
  uploadStudents,
);

export default router;
