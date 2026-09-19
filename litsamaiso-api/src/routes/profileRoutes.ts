import { Router } from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import { getProfile, updateProfile, updateTourProgress } from "../controllers/profileController.js";

const router = Router();

router.use(requireAuth);

router.get("/", getProfile);
router.put("/", updateProfile);
router.patch("/tour", updateTourProgress);

export default router;
