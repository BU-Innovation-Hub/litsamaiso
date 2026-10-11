import { Router } from "express";
import * as institutionController from "../controllers/institutionController.js";
import { requireAuth, requireRole } from "../middleware/authMiddleware.js";
import { overrideBilling } from "../controllers/billingController.js";

const router = Router();

// All institution endpoints require authentication
router.use(requireAuth);

// PUT /institutions/me/theme - update own workspace theme (InstitutionAdmin)
router.put("/me/theme", requireRole("InstitutionAdmin"), institutionController.updateMyTheme);

// GET /institutions - list institutions (AppAdmin only)
router.get("/", requireRole("AppAdmin"), institutionController.listInstitutions);

// POST /institutions - create an institution with first admin (AppAdmin)
router.post("/", requireRole("AppAdmin"), institutionController.createInstitution);

// PUT /institutions/:id - update an institution (AppAdmin)
router.put("/:id", requireRole("AppAdmin"), institutionController.updateInstitution);

// DELETE /institutions/:id - delete an institution and related data (AppAdmin)
router.delete("/:id", requireRole("AppAdmin"), institutionController.deleteInstitution);

// POST /institutions/:id/lock - lock an institution (AppAdmin)
router.post("/:id/lock", requireRole("AppAdmin"), institutionController.lockInstitution);

// POST /institutions/:id/unlock - unlock an institution (AppAdmin)
router.post("/:id/unlock", requireRole("AppAdmin"), institutionController.unlockInstitution);

// PATCH /institutions/:id/billing - manual billing override (AppAdmin)
router.patch("/:id/billing", requireRole("AppAdmin"), overrideBilling);

// GET /institutions/:id/users - list users for an institution (AppAdmin or InstitutionAdmin for their own)
router.get("/:id/users", institutionController.getInstitutionUsers);

// POST /institutions/:id/users - create role user for an institution
router.post(
	"/:id/users",
	requireRole(["AppAdmin", "InstitutionAdmin"]),
	institutionController.createInstitutionRoleUser,
);

export default router;
