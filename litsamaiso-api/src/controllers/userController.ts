import type { Request, Response } from "express";
import { User } from "../models/User.js";
import { Role } from "../models/Role.js";

// Helper: get id string from ObjectId, populated doc, or string
const idOf = (v: any): string | null => {
  if (!v) return null;
  if (typeof v === "string") return v;
  if (typeof v === "object") {
    if ((v as any)._id) return String((v as any)._id);
    if (typeof (v as any).toString === "function") return String(v);
  }
  return null;
};

// Helper: check if current user (req.user) can operate on target user
const canOperateOn = (currentUser: any, targetUser: any): boolean => {
  const currentRole =
    (currentUser.role && (currentUser.role as any).name) ||
    (currentUser.role as string);
  if (currentRole === "AppAdmin") return true;
  if (currentRole === "InstitutionAdmin") {
    // Compare institution IDs robustly (handles populated docs and ObjectIds)
    const curInst = idOf(currentUser.institution);
    const tgtInst = idOf(targetUser.institution);
    return curInst !== null && tgtInst !== null && curInst === tgtInst;
  }
  return false;
};

export const listUsers = async (req: Request, res: Response): Promise<void> => {
  const currentUser = (req as any).user;
  const currentRole =
    (currentUser.role && (currentUser.role as any).name) ||
    (currentUser.role as string);

  if (currentRole === "AppAdmin") {
    const users = await User.find()
      .select("email role institution studentId faceImageUrl")
      .populate("role", "name")
      .populate("institution", "name email");
    res.json({ users });
    return;
  }

  // InstitutionAdmin: filter by institution
  const users = await User.find({ institution: currentUser.institution })
    .select("email role institution studentId faceImageUrl")
    .populate("role", "name")
    .populate("institution", "name email");
  res.json({ users });
};

export const getUser = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const currentUser = (req as any).user;

  const user = await User.findById(id)
    .select("email role institution studentId faceImageUrl")
    .populate("role", "name")
    .populate("institution", "name email");
  if (!user) {
    res.status(404).json({ message: "User not found" });
    return;
  }

  if (!canOperateOn(currentUser, user)) {
    res.status(403).json({ message: "Forbidden" });
    return;
  }

  res.json({ user });
};

export const updateUser = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { id } = req.params;
  const currentUser = (req as any).user;

  const user = await User.findById(id);
  if (!user) {
    res.status(404).json({ message: "User not found" });
    return;
  }

  if (!canOperateOn(currentUser, user)) {
    res.status(403).json({ message: "Forbidden" });
    return;
  }

  const { email, role, studentId, faceDescriptor, faceImageUrl } =
    req.body as any;

  if (email) user.email = email;
  if (studentId) user.studentId = studentId;
  if (faceDescriptor) user.faceDescriptor = faceDescriptor;
  if (faceImageUrl) user.faceImageUrl = faceImageUrl;

  // Only AppAdmin can change role or institution
  const currentRole =
    (currentUser.role && (currentUser.role as any).name) ||
    (currentUser.role as string);
  if (currentRole === "AppAdmin") {
    if (role) user.role = role;
    if ((req.body as any).institution)
      user.institution = (req.body as any).institution;
  }

  await user.save();

  res.json({
    message: "User updated",
    user: {
      id: user._id,
      email: user.email,
      role: user.role,
      institution: user.institution,
    },
  });
};

export const deleteUser = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { id } = req.params;
  const currentUser = (req as any).user;

  const user = await User.findById(id);
  if (!user) {
    res.status(404).json({ message: "User not found" });
    return;
  }

  if (!canOperateOn(currentUser, user)) {
    res.status(403).json({ message: "Forbidden" });
    return;
  }

  await User.findByIdAndDelete(id);
  res.json({ message: "User deleted" });
};
