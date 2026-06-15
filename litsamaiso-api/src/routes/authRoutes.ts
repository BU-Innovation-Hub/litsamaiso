import { Router } from "express";
import multer from "multer";

import {
	login,
	register,
	requestPasswordReset,
	resetPassword,
} from "../controllers/authController.js";
import createRateLimit from "../middleware/rateLimit.js";

const router = Router();

const upload = multer({ storage: multer.memoryStorage() });
const loginRateLimit = createRateLimit({
	windowMs: 15 * 60 * 1000,
	max: 10,
	keyPrefix: "auth-login",
});
const resetRateLimit = createRateLimit({
	windowMs: 60 * 60 * 1000,
	max: 5,
	keyPrefix: "auth-reset",
});

// Use multipart/form-data for registration (field name: `faceImage`)
router.post("/register", upload.single("faceImage"), register);
router.post("/login", loginRateLimit, login);
router.post("/forgot-password", resetRateLimit, requestPasswordReset);
router.post("/reset-password", resetRateLimit, resetPassword);

export default router;
