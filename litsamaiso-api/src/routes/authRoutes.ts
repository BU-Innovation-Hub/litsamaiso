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

const getRateLimitMax = (envName: string, fallback: number): number => {
	const value = Number(process.env[envName]);
	return Number.isInteger(value) && value > 0 ? value : fallback;
};

const upload = multer({ storage: multer.memoryStorage() });
const registerRateLimit = createRateLimit({
	windowMs: 15 * 60 * 1000,
	max: getRateLimitMax("AUTH_REGISTER_RATE_LIMIT_MAX", 5000),
	keyPrefix: "auth-register",
});
const loginRateLimit = createRateLimit({
	windowMs: 15 * 60 * 1000,
	max: getRateLimitMax("AUTH_LOGIN_RATE_LIMIT_MAX", 5000),
	keyPrefix: "auth-login",
});
const resetRateLimit = createRateLimit({
	windowMs: 60 * 60 * 1000,
	max: getRateLimitMax("AUTH_RESET_RATE_LIMIT_MAX", 20),
	keyPrefix: "auth-reset",
});

// Use multipart/form-data for registration (field name: `faceImage`)
router.post("/register", registerRateLimit, upload.single("faceImage"), register);
router.post("/login", loginRateLimit, login);
router.post("/forgot-password", resetRateLimit, requestPasswordReset);
router.post("/reset-password", resetRateLimit, resetPassword);

export default router;
