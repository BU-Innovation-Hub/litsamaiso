import { createHash, createHmac, randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import { Secret, TOTP } from "otpauth";
import QRCode from "qrcode";
import { User } from "../models/User.js";
import { recordAudit } from "../utils/auditLog.js";
import AppError from "../utils/errors.js";
import { decryptSecret, encryptSecret } from "../utils/secretBox.js";

// RFC 6238 settings that every authenticator app supports (Google, Microsoft, Authy, 1Password, ...).
// Other algorithms, lengths or periods are silently ignored by some apps, which then show wrong codes.
const TOTP_ALGORITHM = "SHA1";
const TOTP_DIGITS = 6;
const TOTP_PERIOD_SECONDS = 30;
const SECRET_BYTES = 20;
// Also accept the previous and next code, for phones whose clock is slightly off
const VALIDATION_WINDOW = 1;
// Time to scan the QR code and type the first code
const ENROLLMENT_TTL_SECONDS = 10 * 60;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
// Not shown to students: the grant normally ends when the photo is saved or the camera is closed
const DEFAULT_CAPTURE_GRANT_TTL_MINUTES = 30;

const CODE_PATTERN = new RegExp(`^\\d{${TOTP_DIGITS}}$`);

export type TotpEnrollment = {
  secret: string;
  otpauthUrl: string;
  qrCodeDataUrl: string;
  enrollmentToken: string;
  expiresAt: string;
};

type Actor = { _id: unknown; email?: string; role?: unknown };

const getIssuer = (): string =>
  process.env.TOTP_ISSUER?.trim() || process.env.APP_NAME?.trim() || "Litsamaiso";

const buildTotp = (secret: string, label = "") =>
  new TOTP({
    issuer: getIssuer(),
    label,
    algorithm: TOTP_ALGORITHM,
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD_SECONDS,
    secret: Secret.fromBase32(secret),
  });

// Derived from JWT_SECRET but not equal to it, so an enrollment token can never pass as a login or face token
const getEnrollmentTokenSecret = (): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new AppError("JWT_SECRET not configured", 500);
  return createHmac("sha256", secret).update("totp-enrollment").digest("hex");
};

const getCaptureGrantTtlMs = (): number => {
  const configured = Number(process.env.PHOTO_CAPTURE_GRANT_TTL_MINUTES);
  const minutes = Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_CAPTURE_GRANT_TTL_MINUTES;
  return minutes * 60 * 1000;
};

const invalidCode = () =>
  new AppError("That code is incorrect. Enter the 6-digit code your authenticator app shows now.", 400, "TOTP_INVALID");

const lockedOut = (until: Date) =>
  new AppError(
    `Too many incorrect codes. Try again in ${Math.max(1, Math.ceil((until.getTime() - Date.now()) / 60000))} minutes.`,
    429,
    "TOTP_LOCKED",
  );

// Apps show codes as "123 456"; accept them however they're pasted
export const normalizeCode = (code: unknown): string =>
  typeof code === "string" || typeof code === "number" ? String(code).replace(/\s+/g, "") : "";

// The time step the code was generated for, or null if it isn't valid now
export const matchCode = (secret: string, code: string, timestamp = Date.now()): number | null => {
  if (!CODE_PATTERN.test(code)) return null;
  const delta = buildTotp(secret).validate({ token: code, timestamp, window: VALIDATION_WINDOW });
  if (delta === null) return null;
  return TOTP.counter({ period: TOTP_PERIOD_SECONDS, timestamp }) + delta;
};

// A new key for the student's authenticator app. The token carries the key (encrypted) until the
// first code confirms the app was set up, so nothing is stored for a setup that's abandoned.
export const createEnrollment = async (params: {
  subject: string;
  label: string;
  replace?: boolean;
}): Promise<TotpEnrollment> => {
  const secret = new Secret({ size: SECRET_BYTES }).base32;
  const otpauthUrl = buildTotp(secret, params.label).toString();
  const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl, { errorCorrectionLevel: "M", margin: 1, width: 240 });
  const enrollmentToken = jwt.sign(
    { sec: encryptSecret(secret), replace: params.replace === true },
    getEnrollmentTokenSecret(),
    { subject: params.subject, expiresIn: ENROLLMENT_TTL_SECONDS },
  );

  return {
    secret,
    otpauthUrl,
    qrCodeDataUrl,
    enrollmentToken,
    expiresAt: new Date(Date.now() + ENROLLMENT_TTL_SECONDS * 1000).toISOString(),
  };
};

// Valid only for the subject (email at registration, user id on the profile) it was issued to
export const readEnrollmentToken = (token: unknown, subject: string): { secret: string; replace: boolean } => {
  if (typeof token !== "string" || !token) {
    throw new AppError("Set up your authenticator app to continue.", 400, "TOTP_REQUIRED");
  }
  try {
    const payload = jwt.verify(token, getEnrollmentTokenSecret(), { subject }) as jwt.JwtPayload;
    if (typeof payload.sec !== "string") throw new Error("Enrollment token has no secret");
    return { secret: decryptSecret(payload.sec), replace: payload.replace === true };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      "Your authenticator setup expired. Scan the new QR code and try again.",
      400,
      "TOTP_ENROLLMENT_EXPIRED",
    );
  }
};

// Checks the first code from a freshly scanned QR code and returns the fields that turn the app on
export const confirmEnrollmentCode = (secret: string, code: unknown) => {
  const step = matchCode(secret, normalizeCode(code));
  if (step === null) throw invalidCode();
  return {
    totpSecretEncrypted: encryptSecret(secret),
    totpEnabledAt: new Date(),
    totpLastUsedStep: step,
    totpFailedAttempts: 0,
  };
};

// Checks a code from the student's authenticator app. Each code is accepted once, and repeated
// wrong codes lock the check for a while (stored on the user, so it holds across server instances).
export const verifyUserCode = async (userId: string, code: unknown): Promise<void> => {
  const user = await User.findById(userId).select("+totpSecretEncrypted +totpLockedUntil");
  if (!user?.totpSecretEncrypted || !user.totpEnabledAt) {
    throw new AppError("Set up your authenticator app first.", 409, "TOTP_NOT_ENROLLED");
  }
  if (user.totpLockedUntil && user.totpLockedUntil > new Date()) {
    throw lockedOut(user.totpLockedUntil);
  }

  const step = matchCode(decryptSecret(user.totpSecretEncrypted), normalizeCode(code));
  if (step !== null) {
    // Conditional on the step, so a code is accepted once even when two requests race
    const accepted = await User.updateOne(
      { _id: userId, totpLastUsedStep: { $not: { $gte: step } } },
      { $set: { totpLastUsedStep: step, totpFailedAttempts: 0 }, $unset: { totpLockedUntil: 1 } },
    );
    if (accepted.modifiedCount === 1) return;
    throw new AppError("That code was already used. Wait for the next code in your authenticator app.", 400, "TOTP_REUSED");
  }

  const failed = await User.findByIdAndUpdate(userId, { $inc: { totpFailedAttempts: 1 } }, { new: true }).select(
    "+totpFailedAttempts",
  );
  if ((failed?.totpFailedAttempts ?? 0) >= MAX_FAILED_ATTEMPTS) {
    const until = new Date(Date.now() + LOCKOUT_MS);
    await User.updateOne({ _id: userId }, { $set: { totpLockedUntil: until, totpFailedAttempts: 0 } });
    throw lockedOut(until);
  }
  throw invalidCode();
};

// Turns on (or moves to a new device) the authenticator app of a signed-in student
export const enableTotp = async (params: { userId: string; enrollmentToken: unknown; code: unknown }) => {
  const { secret, replace } = readEnrollmentToken(params.enrollmentToken, params.userId);
  const user = await User.findById(params.userId).select("email totpEnabledAt");
  if (!user) throw new AppError("User not found", 404);
  // Replacing an app is only started after a code from the current one, which sets `replace`
  if (user.totpEnabledAt && !replace) {
    throw new AppError("Your authenticator app is already set up.", 409, "TOTP_ALREADY_ENROLLED");
  }

  await User.updateOne(
    { _id: params.userId },
    { $set: confirmEnrollmentCode(secret, params.code), $unset: { totpLockedUntil: 1 } },
  );
  await recordAudit({
    action: user.totpEnabledAt ? "totp.re_enrolled" : "totp.enrolled",
    actorId: params.userId,
    actorEmail: user.email,
    actorRole: "Student",
    targetCollection: "users",
    targetId: params.userId,
  });
};

const hashGrant = (grant: string): string => createHash("sha256").update(grant).digest("hex");

// A code unlocks one profile photo save. Issuing a new grant replaces any earlier one.
export const issuePhotoCaptureGrant = async (userId: string): Promise<string> => {
  const grant = randomBytes(32).toString("base64url");
  await User.updateOne(
    { _id: userId },
    {
      $set: {
        photoCaptureGrantHash: hashGrant(grant),
        photoCaptureGrantExpiresAt: new Date(Date.now() + getCaptureGrantTtlMs()),
      },
    },
  );
  return grant;
};

// Matches the user only while the grant is unused and unexpired; used both to check it and to spend it
export const photoCaptureGrantFilter = (userId: string, grant: string) => ({
  _id: userId,
  photoCaptureGrantHash: hashGrant(grant),
  photoCaptureGrantExpiresAt: { $gt: new Date() },
});

export const hasValidPhotoCaptureGrant = async (userId: string, grant: string): Promise<boolean> =>
  (await User.exists(photoCaptureGrantFilter(userId, grant))) !== null;

export const CLEAR_PHOTO_CAPTURE_GRANT = { photoCaptureGrantHash: 1, photoCaptureGrantExpiresAt: 1 } as const;

// For a student who lost their phone. They set up a new app the next time they take a photo.
export const resetTotp = async (params: { targetUserId: string; actor: Actor }) => {
  const user = await User.findById(params.targetUserId).select("email role").populate("role", "name");
  if (!user) throw new AppError("User not found", 404);
  const roleName = String((user.role as { name?: string } | undefined)?.name ?? "").toLowerCase();
  if (roleName !== "student") {
    throw new AppError("Only students use an authenticator app.", 400, "TOTP_NOT_APPLICABLE");
  }

  await User.updateOne(
    { _id: params.targetUserId },
    {
      $set: { totpFailedAttempts: 0 },
      $unset: {
        totpSecretEncrypted: 1,
        totpEnabledAt: 1,
        totpLastUsedStep: 1,
        totpLockedUntil: 1,
        ...CLEAR_PHOTO_CAPTURE_GRANT,
      },
    },
  );
  await recordAudit({
    action: "totp.reset_by_admin",
    actorId: String(params.actor._id),
    ...(params.actor.email ? { actorEmail: params.actor.email } : {}),
    actorRole: String((params.actor.role as { name?: string } | undefined)?.name ?? params.actor.role ?? ""),
    targetCollection: "users",
    targetId: params.targetUserId,
    details: { targetEmail: user.email },
  });
};
