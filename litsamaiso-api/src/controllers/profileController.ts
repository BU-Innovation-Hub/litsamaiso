import type { Request, Response } from "express";
import { User } from "../models/User.js";
import { SESSION_INSTITUTION_FIELDS } from "../utils/sessionUser.js";

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
  role: getRoleName(user.role),
  institution: user.institution,
  tour: user.tour,
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
    .populate("institution", SESSION_INSTITUTION_FIELDS)
    .select("-password");

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
    .populate("institution", SESSION_INSTITUTION_FIELDS)
    .select("-password");

  if (!updatedUser) {
    res.status(404).json({ message: "User not found" });
    return;
  }

  res.json({
    message: "Profile updated successfully",
    data: serializeProfile(updatedUser),
  });
};

// PATCH /profile/tour - records that the guided tour was completed or skipped.
export const updateTourProgress = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const currentUser = (req as any).user;
  const { action, version } = req.body as { action?: string; version?: number };

  if (action !== "completed" && action !== "dismissed" && action !== "reset") {
    res.status(400).json({ message: "action must be completed, dismissed or reset" });
    return;
  }

  const update =
    action === "reset"
      ? { $unset: { tour: 1 } }
      : {
          $set: {
            [`tour.${action === "completed" ? "completedAt" : "dismissedAt"}`]: new Date(),
            "tour.version": Number.isInteger(version) ? version : 1,
          },
        };

  const user = await User.findByIdAndUpdate(currentUser._id, update, { new: true }).select("tour");
  res.json({ tour: user?.tour ?? null });
};
