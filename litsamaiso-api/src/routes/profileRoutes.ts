import { Router } from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import { readFacePhoto } from "../middleware/faceVerification.js";
import { createRateLimit } from "../middleware/rateLimit.js";
import { getProfile, saveFacePhoto, updateProfile } from "../controllers/profileController.js";

const router = Router();

router.use(requireAuth);

router.get("/", getProfile);
router.put("/", updateProfile);
router.post(
  "/face",
  createRateLimit({ windowMs: 60 * 1000, max: 10, keyPrefix: "profile-face" }),
  readFacePhoto,
  saveFacePhoto,
);

export default router;
