import { createHmac } from "node:crypto";
import jwt from "jsonwebtoken";
import { User } from "../models/User.js";
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

// Compares the camera photo with the embedding stored from the student's profile photo
export const verifyVoterFace = async (params: { userId: string; electionId: string; photo: Buffer }) => {
  const user = await User.findById(params.userId).select("+faceDescriptor");
  const stored = user?.faceDescriptor ?? [];
  if (stored.length === 0) {
    throw new AppError(
      "Take your profile photo before voting. It's what your face is compared with.",
      409,
      "FACE_NOT_ENROLLED",
    );
  }

  const descriptor = await getVoterFaceDescriptor(params.photo);
  const distance = faceDistance(stored, descriptor);
  // Logged for tuning FACE_MATCH_THRESHOLD; the distance can't be turned back into a face
  console.info(`[face-verify] user ${params.userId} election ${params.electionId} distance ${distance.toFixed(3)}`);

  if (distance > getFaceMatchThreshold()) {
    throw new AppError(
      "Your face doesn't match your profile photo. Face the camera in good light and try again.",
      403,
      "FACE_MISMATCH",
    );
  }

  return issueFaceToken(params.userId, params.electionId);
};
