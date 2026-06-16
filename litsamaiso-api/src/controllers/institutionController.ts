import type { Request, Response } from "express";
import { Institution } from "../models/Institution.js";
import { User } from "../models/User.js";
import { Role } from "../models/Role.js";
import bcrypt from "bcryptjs";

// List institutions (AppAdmin)
export const listInstitutions = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const institutions = await Institution.find().select("name email locked lockedReason");
    res.json({ institutions });
  } catch (err: any) {
    res.status(500).json({ message: err.message || "Failed to list institutions" });
  }
};

export const updateInstitution = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, email } = req.body as any;
    const institution = await Institution.findById(id);
    if (!institution) {
      res.status(404).json({ message: "Institution not found" });
      return;
    }

    const currentUser = (req as any).user;
    const currentRole = (currentUser?.role && (currentUser.role as any).name) || (currentUser?.role as string);
    if (String(currentRole) !== "AppAdmin") {
      res.status(403).json({ message: "Forbidden" });
      return;
    }

    if (email && email !== institution.email) {
      const exists = await Institution.findOne({ email: String(email).trim() });
      if (exists && String(exists._id) !== String(id)) {
        res.status(409).json({ message: "Institution email already exists" });
        return;
      }
      institution.email = String(email).trim();
    }

    if (name) institution.name = name;

    await institution.save();

    res.json({ institution });
  } catch (err: any) {
    res.status(500).json({ message: err.message || "Failed to update institution" });
  }
};

export const getInstitutionUsers = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { search, role } = req.query as any;

    const institution = await Institution.findById(id).select("name email locked lockedReason");
    if (!institution) {
      res.status(404).json({ message: "Institution not found" });
      return;
    }

    const currentUser = (req as any).user;
    const currentRole = (currentUser?.role && (currentUser.role as any).name) || (currentUser?.role as string);

    // AppAdmin can view any institution. InstitutionAdmin can view their own institution only.
    if (String(currentRole) !== "AppAdmin") {
      if (String(currentRole) === "InstitutionAdmin") {
        const curInst = (currentUser?.institution && ((currentUser.institution as any)._id || currentUser.institution)) || null;
        if (!curInst || String(curInst) !== String(id)) {
          res.status(403).json({ message: "Forbidden" });
          return;
        }
      } else {
        res.status(403).json({ message: "Forbidden" });
        return;
      }
    }

    const q: any = { institution: id };
    if (role && typeof role === "string" && role.trim()) {
      const roleDoc = await Role.findOne({ name: role });
      if (roleDoc) q.role = roleDoc._id;
      else {
        res.json({ institution, users: [], roleCounts: [], total: 0 });
        return;
      }
    }

    if (search && typeof search === "string" && search.trim()) {
      const regex = new RegExp(search.trim(), "i");
      q.$or = [{ email: regex }, { studentId: regex }];
    }

    const users = await User.find(q)
      .select("email role institution studentId faceImageUrl")
      .populate("role", "name")
      .populate("institution", "name email");

    const total = users.length;
    const roleCountsMap: Record<string, number> = {};
    for (const u of users) {
      const rname = (u.role && (u.role as any).name) || String(u.role || "");
      roleCountsMap[rname] = (roleCountsMap[rname] || 0) + 1;
    }
    const roleCounts = Object.keys(roleCountsMap).map((r) => ({ role: r, count: roleCountsMap[r] }));

    res.json({ institution, users, roleCounts, total });
  } catch (err: any) {
    res.status(500).json({ message: err.message || "Failed to load institution users" });
  }
};

export const createInstitutionRoleUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, email, password, role } = req.body as any;

    if (!email || !password || !role) {
      res.status(400).json({ message: "name, email, password and role are required" });
      return;
    }

    if (String(password).length < 6) {
      res.status(400).json({ message: "Password must be at least 6 characters long" });
      return;
    }

    const institution = await Institution.findById(id);
    if (!institution) {
      res.status(404).json({ message: "Institution not found" });
      return;
    }

    const currentUser = (req as any).user;
    const currentRole = (currentUser?.role && (currentUser.role as any).name) || (currentUser?.role as string);

    // InstitutionAdmin can only create users for their own institution
    if (String(currentRole) === "InstitutionAdmin") {
      const curInst = (currentUser?.institution && ((currentUser.institution as any)._id || currentUser.institution)) || null;
      if (!curInst || String(curInst) !== String(id)) {
        res.status(403).json({ message: "Forbidden" });
        return;
      }
    } else if (String(currentRole) !== "AppAdmin") {
      res.status(403).json({ message: "Forbidden" });
      return;
    }

    const existing = await User.findOne({ email });
    if (existing) {
      res.status(409).json({ message: "User email already exists" });
      return;
    }

    const roleDoc = await Role.findOne({ name: new RegExp(`^${String(role)}$`, "i") });
    if (!roleDoc) {
      const available = await Role.find().select("name -_id").lean();
      const names = available.map((r: any) => r.name).join(", ");
      res.status(400).json({ message: `Role not found. Available roles: ${names}` });
      return;
    }

    const hashed = await bcrypt.hash(password, 10);

    const user = await User.create({
      email,
      password: hashed,
      role: roleDoc._id,
      institution: institution._id,
      name: name || undefined,
    });

    res.status(201).json({ message: "Role user created", user: { id: user._id, email: user.email, role: roleDoc.name } });
  } catch (err: any) {
    res.status(500).json({ message: err.message || "Failed to create role user" });
  }
};

export default { listInstitutions, updateInstitution, getInstitutionUsers, createInstitutionRoleUser };
