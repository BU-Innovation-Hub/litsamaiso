import { Router, type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import { requireAuth, requireRole } from "../middleware/authMiddleware.js";
import { createRateLimit } from "../middleware/rateLimit.js";
import {
  createElectionHandler,
  updateElectionHandler,
  scheduleElectionHandler,
  getScheduleReadinessHandler,
  closeElectionHandler,
  extendElectionHandler,
  archiveElectionHandler,
  publishResultsHandler,
  deleteElectionHandler,
  listElectionsHandler,
  getElectionHandler,
} from "../controllers/electionController.js";
import {
  createPositionHandler,
  updatePositionHandler,
  deletePositionHandler,
  getPositionHandler,
  listPositionsByElectionHandler,
  listPositionTemplatesHandler,
  importSrcPositionTemplatesHandler,
} from "../controllers/positionController.js";
import {
  createCandidateHandler,
  updateCandidateHandler,
  deleteCandidateHandler,
  listCandidatesByPositionHandler,
  approveCandidateHandler,
  disqualifyCandidateHandler,
  importCandidatesHandler,
} from "../controllers/candidateController.js";
import { castVoteHandler, verifyFaceHandler } from "../controllers/voteController.js";
import { readFacePhoto, requireFaceVerification } from "../middleware/faceVerification.js";
import {
  getResultsHandler,
  recomputeResultsHandler,
  getResultsWinnersHandler,
  getResultsByPositionHandler,
} from "../controllers/resultController.js";
// Router for election-related endpoints, including election management, position and candidate management, voting, and results retrieval
const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype || !file.mimetype.startsWith("image/")) {
      cb(new Error("Only image uploads are allowed"));
      return;
    }
    cb(null, true);
  },
});
const spreadsheetUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = new Set([
      "text/csv",
      "application/csv",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ]);
    const lowerName = (file.originalname || "").toLowerCase();
    const hasAllowedExtension =
      lowerName.endsWith(".csv") ||
      lowerName.endsWith(".xls") ||
      lowerName.endsWith(".xlsx");

    if (!allowedMimeTypes.has(file.mimetype) && !hasAllowedExtension) {
      cb(new Error("Only CSV or Excel spreadsheet uploads are allowed"));
      return;
    }
    cb(null, true);
  },
});

const uploadCandidateImage = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  upload.single("image")(req, res, (err: any) => {
    if (err) {
      res.status(400).json({ message: err.message || "Invalid image upload" });
      return;
    }
    next();
  });
};
const uploadCandidateSpreadsheet = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  spreadsheetUpload.single("file")(req, res, (err: any) => {
    if (err) {
      res.status(400).json({ message: err.message || "Invalid spreadsheet upload" });
      return;
    }
    next();
  });
};
// Apply authentication middleware to all routes in this router
router.use(requireAuth);

router.get("/", requireRole(["SAAD", "IEC", "Student"]), listElectionsHandler);
// Institution-level standard positions; registered before "/:id" so the path isn't read as an election id
router.get("/position-templates", requireRole(["SAAD", "IEC"]), listPositionTemplatesHandler);
router.post("/position-templates/import", requireRole(["SAAD", "IEC"]), importSrcPositionTemplatesHandler);
router.get("/:id", requireRole(["SAAD", "IEC", "Student"]), getElectionHandler);

router.post("/", requireRole(["SAAD", "IEC"]), createElectionHandler);
router.patch("/:id", requireRole(["SAAD", "IEC"]), updateElectionHandler);
router.post("/:id/schedule", requireRole(["SAAD", "IEC"]), scheduleElectionHandler);
// Kept as an alias of schedule: scheduling is the only way to make an election visible
router.post("/:id/publish", requireRole(["SAAD", "IEC"]), scheduleElectionHandler);
router.get("/:id/readiness", requireRole(["SAAD", "IEC"]), getScheduleReadinessHandler);
router.post("/:id/close", requireRole(["SAAD", "IEC"]), closeElectionHandler);
router.post("/:id/extend", requireRole(["SAAD", "IEC"]), extendElectionHandler);
router.post("/:id/archive", requireRole(["SAAD", "IEC"]), archiveElectionHandler);
router.post("/:id/publish-results", requireRole(["SAAD", "IEC"]), publishResultsHandler);
router.delete("/:id", requireRole(["SAAD", "IEC"]), deleteElectionHandler);

router.post(
  "/:electionId/positions",
  requireRole(["SAAD", "IEC"]),
  createPositionHandler,
);
router.get(
  "/:electionId/positions",
  requireRole(["SAAD", "IEC", "Student"]),
  listPositionsByElectionHandler,
);
router.get("/positions/:id", requireRole(["SAAD", "IEC", "Student"]), getPositionHandler);
router.patch("/positions/:id", requireRole(["SAAD", "IEC"]), updatePositionHandler);
router.delete("/positions/:id", requireRole(["SAAD", "IEC"]), deletePositionHandler);

router.post(
  "/:electionId/positions/:positionId/candidates",
  requireRole(["SAAD", "IEC"]),
  uploadCandidateImage,
  createCandidateHandler,
);
router.post(
  "/:electionId/candidates/import",
  requireRole(["SAAD", "IEC"]),
  uploadCandidateSpreadsheet,
  importCandidatesHandler,
);
router.get(
  "/positions/:positionId/candidates",
  requireRole(["SAAD", "IEC", "Student"]),
  listCandidatesByPositionHandler,
);
router.patch(
  "/candidates/:id",
  requireRole(["SAAD", "IEC"]),
  uploadCandidateImage,
  updateCandidateHandler,
);
router.post(
  "/candidates/:id/approve",
  requireRole(["SAAD", "IEC"]),
  approveCandidateHandler,
);
router.post(
  "/candidates/:id/disqualify",
  requireRole(["SAAD", "IEC"]),
  disqualifyCandidateHandler,
);
router.delete(
  "/candidates/:id",
  requireRole(["SAAD", "IEC"]),
  deleteCandidateHandler,
);

// The ballot opens only after the student's face matches their profile photo
router.post(
  "/:electionId/face-verify",
  requireRole("Student"),
  createRateLimit({ windowMs: 60 * 1000, max: 10, keyPrefix: "face-verify" }),
  readFacePhoto,
  verifyFaceHandler,
);

router.post(
  "/:electionId/vote",
  requireRole("Student"),
  createRateLimit({ windowMs: 60 * 1000, max: 5, keyPrefix: "vote" }),
  requireFaceVerification,
  castVoteHandler,
);

router.get(
  "/:electionId/results",
  requireRole(["SAAD", "IEC", "Student"]),
  getResultsHandler,
);
router.get(
  "/:electionId/results/winners",
  requireRole(["SAAD", "IEC", "Student"]),
  getResultsWinnersHandler,
);
router.get(
  "/:electionId/results/positions/:positionId",
  requireRole(["SAAD", "IEC", "Student"]),
  getResultsByPositionHandler,
);
router.post(
  "/:electionId/results/recompute",
  requireRole(["SAAD", "IEC"]),
  recomputeResultsHandler,
);

export default router;
