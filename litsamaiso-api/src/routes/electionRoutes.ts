import { Router, type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import { requireAuth, requireRole } from "../middleware/authMiddleware.js";
import { createRateLimit } from "../middleware/rateLimit.js";
import {
  createElectionHandler,
  updateElectionHandler,
  scheduleElectionHandler,
  publishElectionHandler,
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
import { castVoteHandler } from "../controllers/voteController.js";
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

router.get("/", requireRole(["SAAD", "Student"]), listElectionsHandler);
router.get("/:id", requireRole(["SAAD", "Student"]), getElectionHandler);

router.post("/", requireRole("SAAD"), createElectionHandler);
router.patch("/:id", requireRole("SAAD"), updateElectionHandler);
router.post("/:id/schedule", requireRole("SAAD"), scheduleElectionHandler);
router.post("/:id/publish", requireRole("SAAD"), publishElectionHandler);
router.post("/:id/archive", requireRole("SAAD"), archiveElectionHandler);
router.post("/:id/publish-results", requireRole("SAAD"), publishResultsHandler);
router.delete("/:id", requireRole("SAAD"), deleteElectionHandler);

router.post(
  "/:electionId/positions",
  requireRole("SAAD"),
  createPositionHandler,
);
router.get(
  "/:electionId/positions",
  requireRole(["SAAD", "Student"]),
  listPositionsByElectionHandler,
);
router.get("/positions/:id", requireRole(["SAAD", "Student"]), getPositionHandler);
router.patch("/positions/:id", requireRole("SAAD"), updatePositionHandler);
router.delete("/positions/:id", requireRole("SAAD"), deletePositionHandler);

router.post(
  "/:electionId/positions/:positionId/candidates",
  requireRole("SAAD"),
  uploadCandidateImage,
  createCandidateHandler,
);
router.post(
  "/:electionId/candidates/import",
  requireRole("SAAD"),
  uploadCandidateSpreadsheet,
  importCandidatesHandler,
);
router.get(
  "/positions/:positionId/candidates",
  requireRole(["SAAD", "Student"]),
  listCandidatesByPositionHandler,
);
router.patch(
  "/candidates/:id",
  requireRole("SAAD"),
  uploadCandidateImage,
  updateCandidateHandler,
);
router.post(
  "/candidates/:id/approve",
  requireRole("SAAD"),
  approveCandidateHandler,
);
router.post(
  "/candidates/:id/disqualify",
  requireRole("SAAD"),
  disqualifyCandidateHandler,
);
router.delete(
  "/candidates/:id",
  requireRole("SAAD"),
  deleteCandidateHandler,
);

router.post(
  "/:electionId/vote",
  requireRole("Student"),
  createRateLimit({ windowMs: 60 * 1000, max: 5, keyPrefix: "vote" }),
  castVoteHandler,
);

router.get(
  "/:electionId/results",
  requireRole(["SAAD", "Student"]),
  getResultsHandler,
);
router.get(
  "/:electionId/results/winners",
  requireRole(["SAAD", "Student"]),
  getResultsWinnersHandler,
);
router.get(
  "/:electionId/results/positions/:positionId",
  requireRole(["SAAD", "Student"]),
  getResultsByPositionHandler,
);
router.post(
  "/:electionId/results/recompute",
  requireRole("SAAD"),
  recomputeResultsHandler,
);

export default router;
