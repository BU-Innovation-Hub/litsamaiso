import { Router } from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import { getProfile, updateProfile } from "../controllers/profileController.js";

const router = Router();

router.use(requireAuth);

router.get("/", getProfile);
router.put("/", updateProfile);

export default router;
