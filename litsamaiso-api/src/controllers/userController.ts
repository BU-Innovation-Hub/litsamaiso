import type { Request, Response } from "express";
import { User } from "../models/User.js";
import { Role } from "../models/Role.js";
import bcrypt from "bcryptjs";

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
    query.role = roleId;
  }

  // Search filter: email, studentId, or name
  if (search) {
    const s = String(search).trim();
    const rx = buildRegex(s);
    query.$or = [{ email: rx }, { studentId: rx }, { name: rx }];
  }

  const pageNum = Math.max(parseInt(page) || 1, 1);
  const lim = Math.max(Math.min(parseInt(limit) || 100, 1000), 1);
  const skip = (pageNum - 1) * lim;

  const users = await User.find(query)
    .select("email role institution studentId faceImageUrl name")
    .populate("role", "name")
    .populate("institution", "name email")
    .skip(skip)
    .limit(lim);

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

  const { email, role, studentId, faceDescriptor, faceImageUrl, password } =
    req.body as any;

  if (email) user.email = email;
  if (studentId) user.studentId = studentId;
  if (faceDescriptor) user.faceDescriptor = faceDescriptor;
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
