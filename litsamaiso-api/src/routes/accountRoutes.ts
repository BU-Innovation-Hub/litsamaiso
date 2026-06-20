import { Router } from "express";
import multer from "multer";
import { requireAuth, requireRole } from "../middleware/authMiddleware.js";
import {
  uploadAccounts,
  confirmAccount,
  getConfirmationStatus,
  validateContractNumber,
  getStudentAccounts,
  resolveAccountIssue,
  financeResolveAccountIssue,
  loadPayedStudents,
  updateAccount,
} from "../controllers/accountController.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Only Finance role can upload accounts
router.post(
  "/upload",
  requireAuth,
  requireRole("Finance"),
  upload.single("file"),
  uploadAccounts,
);

router.post("/confirm", requireAuth, requireRole("Student"), upload.single("document"), confirmAccount);
router.get("/status", requireAuth, requireRole("Student"), getConfirmationStatus);
router.get("/validate-contract", requireAuth, requireRole("Student"), validateContractNumber);
// Compatibility alias used by the client: /accounts/confirmation-status
router.get("/confirmation-status", requireAuth, requireRole("Student"), getConfirmationStatus);

// Student-scoped accounts (used by student Issues UI)
router.get("/students", requireAuth, requireRole("Student"), getStudentAccounts);

router.post(
  "/resolve",
  requireAuth,
  requireRole("Student"),
  upload.single("document"),
  resolveAccountIssue,
);

router.post(
  "/finance-resolve",
  requireAuth,
  requireRole("Finance"),
  financeResolveAccountIssue,
);

router.post(
  "/load_payed_students",
  requireAuth,
  requireRole("Finance"),
  upload.single("file"),
  loadPayedStudents,
);

// List accounts - available to Finance, InstitutionAdmin and AppAdmin
router.get("/", requireAuth, requireRole(["AppAdmin", "InstitutionAdmin", "Finance"]), async (req, res, next) => {
  // delegate to controller
  try {
    // lazy-load controller function to avoid circular deps in some setups
    const { listAccounts } = await import("../controllers/accountController.js");
    return listAccounts(req as any, res as any);
  } catch (err) {
    next(err);
  }
});

// Update single account (admin/finance/institution admin)
router.put('/:id', requireAuth, requireRole(["AppAdmin", "InstitutionAdmin", "Finance"]), updateAccount);

export default router;
