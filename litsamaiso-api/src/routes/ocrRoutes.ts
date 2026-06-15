import { Router } from "express";
import multer from "multer";
import { requireAuth, requireRole } from "../middleware/authMiddleware.js";
import { serverOcr } from "../controllers/ocrController.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Student uploads image; server runs Tesseract and returns OCR text + candidates
router.post("/server-ocr", requireAuth, requireRole("Student"), upload.single("file"), serverOcr);

export default router;
