import { Router } from "express";
import * as userController from "../controllers/userController.js";
import { requireAuth, requireRole } from "../middleware/authMiddleware.js";

const router = Router();

// All endpoints require authentication and AppAdmin or InstitutionAdmin
router.use(requireAuth);

// GET /users - list users
router.get(
  "/",
  requireRole(["AppAdmin", "InstitutionAdmin"]),
  userController.listUsers,
);

// GET /users/roles - list available roles
router.get(
  "/roles",
  requireRole(["AppAdmin", "InstitutionAdmin"]),
  userController.getRoles,
);

// GET /users/:id - get a single user
router.get(
  "/:id",
  requireRole(["AppAdmin", "InstitutionAdmin"]),
  userController.getUser,
);

// PUT /users/:id - update a user
router.put(
  "/:id",
  requireRole(["AppAdmin", "InstitutionAdmin"]),
  userController.updateUser,
);

// DELETE /users/:id - delete a user
router.delete(
  "/:id",
  requireRole(["AppAdmin", "InstitutionAdmin"]),
  userController.deleteUser,
);

export default router;
