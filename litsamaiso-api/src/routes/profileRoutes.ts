import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/authMiddleware.js";
import { readFacePhoto } from "../middleware/faceVerification.js";
import { requirePhotoCaptureGrant, requireTotpInstitution } from "../middleware/totpVerification.js";
import { createRateLimit } from "../middleware/rateLimit.js";
import {
  confirmTotpEnrollment,
  getProfile,
  saveFacePhoto,
  startTotpEnrollment,
  unlockFacePhoto,
  updateProfile,
} from "../controllers/profileController.js";

const router = Router();

router.use(requireAuth);

router.get("/", getProfile);
router.put("/", updateProfile);

// Authenticator app (TOTP) for students: set up, move to a new device, and unlock the camera
router.post(
  "/totp/enrollment",
  requireRole("Student"),
  createRateLimit({ windowMs: 60 * 1000, max: 10, keyPrefix: "profile-totp-enroll" }),
  requireTotpInstitution,
  startTotpEnrollment,
);
router.post(
  "/totp/enable",
  requireRole("Student"),
  createRateLimit({ windowMs: 60 * 1000, max: 10, keyPrefix: "profile-totp-enable" }),
  requireTotpInstitution,
  confirmTotpEnrollment,
);
router.post(
  "/face/unlock",
  requireRole("Student"),
  createRateLimit({ windowMs: 60 * 1000, max: 10, keyPrefix: "profile-face-unlock" }),
  requireTotpInstitution,
  unlockFacePhoto,
);

router.post(
  "/face",
  createRateLimit({ windowMs: 60 * 1000, max: 10, keyPrefix: "profile-face" }),
  requirePhotoCaptureGrant,
  readFacePhoto,
  saveFacePhoto,
);

export default router;
