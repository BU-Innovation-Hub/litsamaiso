import type { Request, Response } from "express";
import { User } from "../models/User.js";

const getRoleName = (role: any): string =>
  String((role && role.name) || role || "Student");

const serializeProfile = (user: any) => ({
  id: String(user._id),
  _id: String(user._id),
  name: user.name || "",
  email: user.email,
  studentId: user.studentId || "",
  studentCardUrl: user.studentCardUrl || "",
  faceImageUrl: user.faceImageUrl || "",
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
    .populate("institution", "name email")
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
