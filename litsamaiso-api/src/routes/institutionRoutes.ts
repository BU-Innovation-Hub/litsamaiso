import { Router } from "express";
import * as institutionController from "../controllers/institutionController.js";
import { requireAuth, requireRole } from "../middleware/authMiddleware.js";

const router = Router();

// All institution endpoints require authentication
router.use(requireAuth);

// GET /institutions - list institutions (AppAdmin only)
router.get("/", requireRole("AppAdmin"), institutionController.listInstitutions);

// PUT /institutions/:id - update an institution (AppAdmin)
router.put("/:id", requireRole("AppAdmin"), institutionController.updateInstitution);

// POST /institutions/:id/lock - lock an institution (AppAdmin)
router.post("/:id/lock", requireRole("AppAdmin"), institutionController.lockInstitution);

// POST /institutions/:id/unlock - unlock an institution (AppAdmin)
router.post("/:id/unlock", requireRole("AppAdmin"), institutionController.unlockInstitution);

// GET /institutions/:id/users - list users for an institution (AppAdmin or InstitutionAdmin for their own)
router.get("/:id/users", institutionController.getInstitutionUsers);

// POST /institutions/:id/users - create role user for an institution
router.post(
	"/:id/users",
	requireRole(["AppAdmin", "InstitutionAdmin"]),
	institutionController.createInstitutionRoleUser,
);

export default router;
