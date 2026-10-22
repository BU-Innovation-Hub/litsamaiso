import type { Request, Response } from "express";
import { User } from "../models/User.js";
import { getProfileFaceDescriptor } from "../services/faceService.js";
import { uploadFileBuffer } from "../utils/cloudinary.js";
import { auditActor, recordAudit } from "../utils/auditLog.js";
import AppError from "../utils/errors.js";

const getRoleName = (role: any): string =>
  String((role && role.name) || role || "Student");

const serializeProfile = (user: any) => ({
  id: String(user._id),
  _id: String(user._id),
  name: user.name || "",
  email: user.email,
  studentId: user.studentId || "",
  borrowerNumber: user.borrowerNumber || "",
  studentCardUrl: user.studentCardUrl || "",
  faceImageUrl: user.faceImageUrl || "",
  // Only whether a face is on file; the embedding itself never leaves the server
  hasFaceProfile: (user.faceDescriptor?.length ?? 0) > 0,
  role: getRoleName(user.role),
  institution: user.institution,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

export const getProfile = async (
  req: Request,
  res: Response,
): Promise<void> => {
  res.set("Cache-Control", "no-store");
  const currentUser = (req as any).user;

  const user = await User.findById(currentUser._id)
    .populate("role", "name")
    .populate("institution", "name email")
    .select("+faceDescriptor");

  if (!user) {
    res.status(404).json({ message: "User not found" });
    return;
  }

  res.json({ data: serializeProfile(user) });
};

export const updateProfile = async (
  req: Request,
  res: Response,
): Promise<void> => {
  res.set("Cache-Control", "no-store");
  const currentUser = (req as any).user;
  const { name, email, studentCardUrl } = req.body as {
    name?: string;
    email?: string;
    studentCardUrl?: string;
  };

  const trimmedName = String(name || "").trim();
  const trimmedEmail = String(email || "").trim().toLowerCase();

  if (!trimmedName || !trimmedEmail) {
    res.status(400).json({ message: "Name and email are required" });
    return;
  }

  const existingUser = await User.findOne({
    email: trimmedEmail,
    _id: { $ne: currentUser._id },
  });

  if (existingUser) {
    res.status(409).json({ message: "Email is already taken" });
    return;
  }

  const updateData: {
    name: string;
    email: string;
    studentCardUrl?: string;
  } = {
    name: trimmedName,
    email: trimmedEmail,
  };

  if (typeof studentCardUrl === "string") {
    updateData.studentCardUrl = studentCardUrl.trim();
  }

  const updatedUser = await User.findByIdAndUpdate(
    currentUser._id,
    updateData,
    { new: true, runValidators: true },
  )
    .populate("role", "name")
    .populate("institution", "name email")
    .select("+faceDescriptor");

  if (!updatedUser) {
    res.status(404).json({ message: "User not found" });
    return;
  }

  // req.user was loaded before the update, so it still holds the old values
  const changes: Record<string, { from: string | null; to: string }> = {};
  for (const [field, value] of Object.entries(updateData)) {
    const previous = currentUser[field] ?? null;
    if (previous !== value) changes[field] = { from: previous, to: value };
  }
  await recordAudit({
    ...auditActor(currentUser),
    action: "profile.update",
    targetCollection: "User",
    targetId: String(currentUser._id),
    details: { changes },
  });

  res.json({
    message: "Profile updated successfully",
    data: serializeProfile(updatedUser),
  });
};

// Saves a camera photo as the profile photo, along with the face embedding used to verify voters
export const saveFacePhoto = async (
  req: Request,
  res: Response,
): Promise<void> => {
  res.set("Cache-Control", "no-store");
  const currentUser = (req as any).user;
  const photo = req.file?.buffer as Buffer;

  try {
    // Read the face first, so a photo the check can't use is never stored
    const faceDescriptor = await getProfileFaceDescriptor(photo);
    const replacedFace = Boolean(
      await User.exists({ _id: currentUser._id, "faceDescriptor.0": { $exists: true } }),
    );
    const { url } = await uploadFileBuffer({
      buffer: photo,
      fileName: "profile-photo.jpg",
      folder: "profile-photos",
      resourceType: "image",
    });

    // studentCardUrl is the photo the profile page shows, so it stays in step with the face on file
    const updatedUser = await User.findByIdAndUpdate(
      currentUser._id,
      { studentCardUrl: url, faceImageUrl: url, faceDescriptor },
      { new: true, runValidators: true },
    )
      .populate("role", "name")
      .populate("institution", "name email")
      .select("+faceDescriptor");

    if (!updatedUser) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    // Voting compares faces with this photo, so replacing it is worth a close look
    await recordAudit({
      ...auditActor(currentUser),
      action: "profile.face.enroll",
      targetCollection: "User",
      targetId: String(currentUser._id),
      details: { photoUrl: url, replacedFace },
    });

    res.json({
      message: "Profile photo saved",
      data: serializeProfile(updatedUser),
    });
  } catch (err: unknown) {
    if (err instanceof AppError) {
      await recordAudit({
        ...auditActor(currentUser),
        action: "profile.face.enroll.failed",
        targetCollection: "User",
        targetId: String(currentUser._id),
        details: { reason: err.code ?? err.message },
      });
      res.status(err.statusCode).json({ message: err.message, code: err.code });
      return;
    }
    console.error("Failed to save profile photo", err);
    res.status(500).json({ message: "Your photo could not be saved. Please try again." });
  }
};
