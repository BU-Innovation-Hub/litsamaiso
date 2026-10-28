import type { Request, Response } from "express";
import { User } from "../models/User.js";
import { Role } from "../models/Role.js";
import { auditActor, recordAudit } from "../utils/auditLog.js";
import bcrypt from "bcryptjs";
import { isValidObjectId, Types } from "mongoose";
import { resetTotp } from "../services/totpService.js";
import { appointIecMember, removeIecMember } from "../services/iecService.js";
import AppError from "../utils/errors.js";

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

  const { search, role, page, limit } = req.query as any;

  const buildRegex = (s: string) => {
    // escape regex special chars
    return new RegExp(String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  };

  const query: any = {};

  // If the current user is an InstitutionAdmin scope to their institution
  if (currentRole === "InstitutionAdmin") {
    query.institution = currentUser.institution;
  }

  // Role filter: accept either role id (24-hex) or case-insensitive role name
  if (role) {
    const r = String(role).trim();
    let roleId: string | null = null;
    if (/^[0-9a-fA-F]{24}$/.test(r)) {
      roleId = r;
    } else {
      const roleDoc = await Role.findOne({ name: new RegExp(`^${r}$`, "i") });
      if (roleDoc) roleId = String(roleDoc._id);
    }
    if (!roleId) {
      // no matching role -> return empty set
      res.json({ users: [] });
      return;
    }
    // Matches the primary role or an additional one, so filtering by IEC finds its students.
    // Cast to an ObjectId so the role counts aggregate below matches it too.
    const roleObjectId = new Types.ObjectId(roleId);
    query.$and = [{ $or: [{ role: roleObjectId }, { additionalRoles: roleObjectId }] }];
  }

  // Search filter: email, studentId, or name
  if (search) {
    const s = String(search).trim();
    const rx = buildRegex(s);
    query.$or = [{ email: rx }, { studentId: rx }, { name: rx }];
  }

  const pageNum = Math.max(parseInt(page) || 1, 1);
  const lim = Math.max(Math.min(parseInt(limit) || 10000, 10000), 1);
  const skip = (pageNum - 1) * lim;

  const [users, total, roleCountsAggregate] = await Promise.all([
    User.find(query)
      .select("email role additionalRoles institution studentId faceImageUrl name totpEnabledAt")
      .populate("role", "name")
      .populate("additionalRoles", "name")
      .populate("institution", "name email")
      .skip(skip)
      .limit(lim),
    User.countDocuments(query),
    User.aggregate([
      { $match: query },
      // Count additional roles too, so the IEC shows up alongside the primary roles
      { $project: { roleIds: { $concatArrays: [["$role"], { $ifNull: ["$additionalRoles", []] }] } } },
      { $unwind: "$roleIds" },
      { $lookup: { from: "roles", localField: "roleIds", foreignField: "_id", as: "roleDoc" } },
      { $unwind: "$roleDoc" },
      { $group: { _id: "$roleDoc.name", count: { $sum: 1 } } },
    ]),
  ]);

  const roleCounts = Object.fromEntries(
    roleCountsAggregate.map((item: any) => [item._id, item.count]),
  );

  res.json({
    users,
    total,
    page: pageNum,
    limit: lim,
    pages: Math.ceil(total / lim),
    roleCounts,
  });
};

export const getUser = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const currentUser = (req as any).user;

  const user = await User.findById(id)
    .select("email role additionalRoles institution studentId faceImageUrl name totpEnabledAt")
    .populate("role", "name")
    .populate("additionalRoles", "name")
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

export const getRoles = async (req: Request, res: Response): Promise<void> => {
  try {
    const roles = await Role.find().select('name');
    res.json({ roles });
  } catch (err: any) {
    res.status(500).json({ message: err.message || 'Failed to load roles' });
  }
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

  const { email, role, studentId, faceImageUrl, password } =
    req.body as any;

  const auditedFields = ["email", "studentId", "faceImageUrl", "role", "institution"] as const;
  const before = Object.fromEntries(auditedFields.map((field) => [field, idOf((user as any)[field])]));

  if (email) user.email = email;
  if (studentId) user.studentId = studentId;
  if (faceImageUrl) user.faceImageUrl = faceImageUrl;

  // Password change: only allow when provided (admins perform resets)
  if (password) {
    const pw = String(password || "").trim();
    if (pw.length < 6) {
      res.status(400).json({ message: "Password must be at least 6 characters long" });
      return;
    }
    const hashed = await bcrypt.hash(pw, 10);
    // assign hashed password directly (password field is select:false)
    (user as any).password = hashed;
  }

  // Only AppAdmin can change role or institution
  const currentRole =
    (currentUser.role && (currentUser.role as any).name) ||
    (currentUser.role as string);
  if (currentRole === "AppAdmin") {
    if (role) {
      // role may be provided as an ObjectId string, an ObjectId, or a role name
      if (typeof role === "string") {
        const r = role.trim();
        let roleDoc = null as any;
        // try by id first (24 hex)
        if (/^[0-9a-fA-F]{24}$/.test(r)) {
          roleDoc = await Role.findById(r);
        }
        // fallback to case-insensitive name lookup
        if (!roleDoc) {
          roleDoc = await Role.findOne({ name: new RegExp(`^${r}$`, "i") });
        }
        if (!roleDoc) {
          res.status(400).json({ message: "Role not found" });
          return;
        }
        // IEC is held by students on top of their Student role, never as an account's own role
        if (String(roleDoc.name).toLowerCase() === "iec") {
          res.status(400).json({ message: "Appoint students to the IEC instead of making it their role" });
          return;
        }
        user.role = roleDoc._id;
      } else if (typeof role === "object" && (role as any)._id) {
        user.role = (role as any)._id;
      } else {
        user.role = role;
      }
    }

    if ((req.body as any).institution) {
      const inst = (req.body as any).institution;
      // accept either id or populated object
      user.institution = (inst && (inst._id || inst)) || inst;
    }
  }

  await user.save();

  const changes: Record<string, { from: string | null; to: string | null }> = {};
  for (const field of auditedFields) {
    const after = idOf((user as any)[field]);
    if (after !== before[field]) changes[field] = { from: before[field] ?? null, to: after };
  }
  await recordAudit({
    ...auditActor(currentUser),
    action: "user.update",
    targetCollection: "User",
    targetId: String(user._id),
    // The new password itself is never logged, only that an admin set one
    details: { changes, ...(password ? { passwordChanged: true } : {}) },
  });

  const updatedUser = await User.findById(user._id)
    .select("email role institution studentId faceImageUrl name borrowerNumber studentCardUrl")
    .populate("role", "name")
    .populate("institution", "name email")
    .lean();

  res.json({ message: "User updated", user: updatedUser });
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

  await recordAudit({
    ...auditActor(currentUser),
    action: "user.delete",
    targetCollection: "User",
    targetId: String(user._id),
    details: {
      email: user.email,
      role: idOf(user.role),
      institution: idOf(user.institution),
      ...(user.studentId ? { studentId: user.studentId } : {}),
    },
  });

  res.json({ message: "User deleted" });
};

// For a student who lost the phone with their authenticator app; audit-logged
export const resetUserTotp = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const id = String(req.params.id ?? "");
  if (!isValidObjectId(id)) {
    res.status(404).json({ message: "User not found" });
    return;
  }

  try {
    await resetTotp({ targetUserId: id, actor: (req as any).user });
    res.json({ message: "Authenticator app reset. The student will set up a new one before their next photo." });
  } catch (err: unknown) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ message: err.message, code: err.code });
      return;
    }
    console.error("Failed to reset TOTP", err);
    res.status(500).json({ message: "The authenticator app could not be reset. Please try again." });
  }
};

// Appoint a student to, or remove them from, their institution's IEC; audit-logged
const changeIecMembership = (change: typeof appointIecMember) =>
  async (req: Request, res: Response): Promise<void> => {
    const id = String(req.params.id ?? "");
    if (!isValidObjectId(id)) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    const target = await User.findById(id).select("institution");
    if (!target) {
      res.status(404).json({ message: "User not found" });
      return;
    }
    if (!canOperateOn((req as any).user, target)) {
      res.status(403).json({ message: "Forbidden" });
      return;
    }

    try {
      await change({ actor: (req as any).user, userId: id });
      const user = await User.findById(id)
        .select("email role additionalRoles institution studentId faceImageUrl name totpEnabledAt")
        .populate("role", "name")
        .populate("additionalRoles", "name")
        .populate("institution", "name email");
      res.json({ user });
    } catch (err: unknown) {
      if (err instanceof AppError) {
        res.status(err.statusCode).json({ message: err.message, code: err.code });
        return;
      }
      console.error("Failed to change IEC membership", err);
      res.status(500).json({ message: "IEC membership could not be changed. Please try again." });
    }
  };

export const appointIec = changeIecMembership(appointIecMember);
export const removeIec = changeIecMembership(removeIecMember);
