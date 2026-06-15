import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/authMiddleware.js";
import {
  getResultsHandler,
  getResultsWinnersHandler,
  getResultsByPositionHandler,
  recomputeResultsHandler,
} from "../controllers/resultController.js";
// Router for result-related endpoints, including retrieving results snapshots, winners, and recomputing results for an election
const router = Router();

router.use(requireAuth);

router.get(
  "/:electionId",
  requireRole(["SAAD", "Student"]),
  getResultsHandler,
);
router.get(
  "/:electionId/winners",
  requireRole(["SAAD", "Student"]),
  getResultsWinnersHandler,
);
router.get(
  "/:electionId/positions/:positionId",
  requireRole(["SAAD", "Student"]),
  getResultsByPositionHandler,
);
router.post(
  "/:electionId/recompute",
  requireRole("SAAD"),
  recomputeResultsHandler,
);

export default router;
