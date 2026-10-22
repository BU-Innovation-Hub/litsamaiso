import { createHmac } from "node:crypto";
import jwt from "jsonwebtoken";
import { User } from "../models/User.js";
import { auditActor, recordAudit } from "../utils/auditLog.js";
import AppError from "../utils/errors.js";
import { faceDistance, getFaceMatchThreshold, getVoterFaceDescriptor } from "./faceService.js";

// Long enough to read and fill in the ballot after the face check
const FACE_TOKEN_TTL_SECONDS = 15 * 60;

// Derived from JWT_SECRET but not equal to it, so a face token can never pass requireAuth as a login token
const getFaceTokenSecret = (): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new AppError("JWT_SECRET not configured", 500);
  return createHmac("sha256", secret).update("face-verification").digest("hex");
};

export const issueFaceToken = (userId: string, electionId: string) => {
  const faceToken = jwt.sign({ electionId }, getFaceTokenSecret(), {
    subject: userId,
    expiresIn: FACE_TOKEN_TTL_SECONDS,
  });
  return {
    faceToken,
    expiresAt: new Date(Date.now() + FACE_TOKEN_TTL_SECONDS * 1000).toISOString(),
  };
};

// Valid only for the student it was issued to, in the election it was issued for
export const isValidFaceToken = (token: string, userId: string, electionId: string): boolean => {
  try {
    const payload = jwt.verify(token, getFaceTokenSecret()) as jwt.JwtPayload;
    return payload.sub === userId && payload.electionId === electionId;
  } catch {
    return false;
  }
};

// Compares the camera photo with the embedding stored from the student's profile photo.
// Every attempt is audited, so repeated failures on one account stand out.
export const verifyVoterFace = async (params: { user: any; electionId: string; photo: Buffer }) => {
  const userId = String(params.user._id);
  const audit = (action: string, details: Record<string, unknown>) =>
    recordAudit({
      ...auditActor(params.user),
      action,
      targetCollection: "Election",
      targetId: params.electionId,
      details,
    });

  // The distance can't be turned back into a face, so it's safe to keep for tuning FACE_MATCH_THRESHOLD
  let comparison: { distance: number; threshold: number } | undefined;
  try {
    const user = await User.findById(userId).select("+faceDescriptor");
    const stored = user?.faceDescriptor ?? [];
    if (stored.length === 0) {
      throw new AppError(
        "Take your profile photo before voting. It's what your face is compared with.",
        409,
        "FACE_NOT_ENROLLED",
      );
    }

    const descriptor = await getVoterFaceDescriptor(params.photo);
    comparison = { distance: faceDistance(stored, descriptor), threshold: getFaceMatchThreshold() };
    console.info(
      `[face-verify] user ${userId} election ${params.electionId} distance ${comparison.distance.toFixed(3)}`,
    );

    if (comparison.distance > comparison.threshold) {
      throw new AppError(
        "Your face doesn't match your profile photo. Face the camera in good light and try again.",
        403,
        "FACE_MISMATCH",
      );
    }
  } catch (error) {
    await audit("vote.faceVerify.failed", {
      reason: error instanceof AppError ? (error.code ?? error.message) : "ERROR",
      ...comparison,
    });
    throw error;
  }

  await audit("vote.faceVerify", { ...comparison });
  return issueFaceToken(userId, params.electionId);
};
