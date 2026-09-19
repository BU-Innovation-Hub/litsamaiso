import type { Request, Response } from "express";
import { Institution } from "../models/Institution.js";
import { User } from "../models/User.js";
import { Role } from "../models/Role.js";
import { Student } from "../models/Student.js";
import { FinancialClearance } from "../models/FinancialClearance.js";
import { Election } from "../models/Election.js";
import { Candidate } from "../models/Candidate.js";
import { Position } from "../models/Position.js";
import { Ballot } from "../models/Ballot.js";
import { ResultSnapshot } from "../models/ResultSnapshot.js";
import bcrypt from "bcryptjs";
import AppError from "../utils/errors.js";
import { provisionInstitution } from "../services/institutionProvisioningService.js";
import { parseTheme, validateTheme } from "../utils/themePalette.js";
import { SESSION_INSTITUTION_FIELDS } from "../utils/sessionUser.js";

// List institutions (AppAdmin)
export const listInstitutions = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { page, limit } = req.query as any;
    const pageNum = Math.max(parseInt(page) || 1, 1);
    const lim = Math.max(Math.min(parseInt(limit) || 10000, 10000), 1);
    const skip = (pageNum - 1) * lim;

    const [institutions, total] = await Promise.all([
      Institution.find().select("name email locked lockedReason").skip(skip).limit(lim),
      Institution.countDocuments(),
    ]);

    res.json({ institutions, total, page: pageNum, limit: lim, pages: Math.ceil(total / lim) });
  } catch (err: any) {
    res.status(500).json({ message: err.message || "Failed to list institutions" });
  }
};

export const createInstitution = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, adminName, adminEmail, adminPassword } = req.body as any;

    if (!name || !email) {
      res.status(400).json({ message: 'name and email are required' });
      return;
    }

    if (!adminEmail || !adminPassword) {
      res.status(400).json({ message: 'adminEmail and adminPassword are required' });
      return;
    }

    // AppAdmin-created institutions are billed outside Stripe ("manual").
    const { institution, admin, role } = await provisionInstitution({
      institution: { name: String(name), email: String(email) },
      admin: { name: adminName ? String(adminName) : undefined, email: String(adminEmail), password: String(adminPassword) },
      billing: { status: 'manual' },
    });

    res.status(201).json({
      institution,
      admin: { id: admin._id, email: admin.email, name: admin.name, role: role.name, institution: institution._id },
    });
  } catch (err: any) {
    const status = err instanceof AppError ? err.statusCode : 500;
    res.status(status).json({ message: err.message || 'Failed to create institution' });
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
    const { search, role, page, limit } = req.query as any;

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
      const r = role.trim();
      const roleDoc = await Role.findOne({ name: new RegExp(`^${r}$`, "i") });
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

    const pageNum = Math.max(parseInt(page) || 1, 1);
    const lim = Math.max(Math.min(parseInt(limit) || 10000, 10000), 1);
    const skip = (pageNum - 1) * lim;

    const [users, total] = await Promise.all([
      User.find(q)
        .select("email role institution studentId faceImageUrl name")
        .populate("role", "name")
        .populate("institution", "name email")
        .skip(skip)
        .limit(lim),
      User.countDocuments(q),
    ]);

    const roleCountsMap: Record<string, number> = {};
    for (const u of users) {
      const rname = (u.role && (u.role as any).name) || String(u.role || "");
      roleCountsMap[rname] = (roleCountsMap[rname] || 0) + 1;
    }
    const roleCounts = Object.keys(roleCountsMap).map((r) => ({ role: r, count: roleCountsMap[r] }));

    res.json({ institution, users, roleCounts, total, page: pageNum, limit: lim, pages: Math.ceil(total / lim) });
  } catch (err: any) {
    res.status(500).json({ message: err.message || "Failed to load institution users" });
  }
};

export const createInstitutionRoleUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, email, password, role, studentId } = req.body as any;

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

    if (studentId && typeof studentId === 'string' && String(studentId).trim()) {
      const existingSid = await User.findOne({ studentId: String(studentId).trim() });
      if (existingSid) {
        res.status(409).json({ message: 'Student ID already exists' });
        return;
      }
    }

    const roleDoc = await Role.findOne({ name: new RegExp(`^${String(role)}$`, "i") });
    if (!roleDoc) {
      const available = await Role.find().select("name -_id").lean();
      const names = available.map((r: any) => r.name).join(", ");
      res.status(400).json({ message: `Role not found. Available roles: ${names}` });
      return;
    }

    const hashed = await bcrypt.hash(password, 10);

    const roleId = (roleDoc as any)._id;
    const instId = (institution as any)._id;

    const newUser = new User();
    (newUser as any).email = email;
    (newUser as any).password = hashed;
    (newUser as any).role = roleId;
    (newUser as any).institution = instId;
    if (name) (newUser as any).name = name;
    if (studentId) (newUser as any).studentId = String(studentId).trim();
    await newUser.save();

    res.status(201).json({ message: "Role user created", user: { id: newUser._id, email: newUser.email, role: roleDoc.name } });
  } catch (err: any) {
    res.status(500).json({ message: err.message || "Failed to create role user" });
  }
};

export const lockInstitution = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { reason } = req.body as any;

    const institution = await Institution.findById(id);
    if (!institution) {
      res.status(404).json({ message: 'Institution not found' });
      return;
    }

    // Only AppAdmin may lock/unlock institutions
    const currentUser = (req as any).user;
    const currentRole = (currentUser?.role && (currentUser.role as any).name) || (currentUser?.role as string);
    if (String(currentRole) !== 'AppAdmin') {
      res.status(403).json({ message: 'Forbidden' });
      return;
    }

    institution.locked = true;
    institution.lockedReason = reason || undefined;
    institution.lockedAt = new Date();
    institution.lockedBy = 'manual';

    await institution.save();

    res.json({ institution });
  } catch (err: any) {
    res.status(500).json({ message: err.message || 'Failed to lock institution' });
  }
};

export const unlockInstitution = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const institution = await Institution.findById(id);
    if (!institution) {
      res.status(404).json({ message: 'Institution not found' });
      return;
    }

    const currentUser = (req as any).user;
    const currentRole = (currentUser?.role && (currentUser.role as any).name) || (currentUser?.role as string);
    if (String(currentRole) !== 'AppAdmin') {
      res.status(403).json({ message: 'Forbidden' });
      return;
    }

    institution.locked = false;
    (institution as any).lockedReason = undefined;
    institution.lockedAt = undefined as any;
    institution.lockedBy = undefined;

    await institution.save();

    res.json({ institution });
  } catch (err: any) {
    res.status(500).json({ message: err.message || 'Failed to unlock institution' });
  }
};

export const deleteInstitution = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const institution = await Institution.findById(id);
    if (!institution) {
      res.status(404).json({ message: 'Institution not found' });
      return;
    }

    const currentUser = (req as any).user;
    const currentRole = (currentUser?.role && (currentUser.role as any).name) || (currentUser?.role as string);
    if (String(currentRole) !== 'AppAdmin') {
      res.status(403).json({ message: 'Forbidden' });
      return;
    }

    // Use the institution's ObjectId for queries
    const instId = (institution as any)._id;

    // Delete users, students, accounts belonging to institution
    const usersRes = await User.deleteMany({ institution: instId } as any);
    const studentsRes = await Student.deleteMany({ institution: instId } as any);
    const accountsRes = await FinancialClearance.deleteMany({ institution: instId } as any);

    // Find elections for this institution and delete related election data
    const elections = await Election.find({ institution: instId } as any).select('_id').lean();
    const electionIds = elections.map((e: any) => e._id).filter(Boolean);

    let positionsRes: any = { deletedCount: 0 };
    let candidatesRes: any = { deletedCount: 0 };
    let ballotsRes: any = { deletedCount: 0 };
    let snapshotsRes: any = { deletedCount: 0 };
    let electionsRes: any = { deletedCount: 0 };

    if (electionIds.length > 0) {
      positionsRes = await Position.deleteMany({ electionId: { $in: electionIds } });
      candidatesRes = await Candidate.deleteMany({ electionId: { $in: electionIds } });
      ballotsRes = await Ballot.deleteMany({ electionId: { $in: electionIds } });
      snapshotsRes = await ResultSnapshot.deleteMany({ electionId: { $in: electionIds } });
      electionsRes = await Election.deleteMany({ _id: { $in: electionIds } });
    }

    // Finally delete the institution
    await institution.deleteOne();

    res.json({
      message: 'Institution deleted',
      deleted: {
        institutions: 1,
        users: usersRes.deletedCount || 0,
        students: studentsRes.deletedCount || 0,
        accounts: accountsRes.deletedCount || 0,
        elections: electionsRes.deletedCount || 0,
        positions: positionsRes.deletedCount || 0,
        candidates: candidatesRes.deletedCount || 0,
        ballots: ballotsRes.deletedCount || 0,
        resultSnapshots: snapshotsRes.deletedCount || 0,
      },
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message || 'Failed to delete institution' });
  }
};

export default { listInstitutions, createInstitution, updateInstitution, getInstitutionUsers, createInstitutionRoleUser, lockInstitution, unlockInstitution, deleteInstitution };

// PUT /institutions/me/theme - InstitutionAdmin updates their workspace branding.
export const updateMyTheme = async (req: Request, res: Response): Promise<void> => {
  try {
    const currentUser = (req as any).user;
    const theme = parseTheme(req.body?.theme ?? req.body);
    const issues = validateTheme(theme);
    if (issues.length) {
      res.status(400).json({ message: issues[0], issues });
      return;
    }

    const institution = await Institution.findByIdAndUpdate(
      currentUser.institution,
      { $set: { theme } },
      { new: true, runValidators: true },
    ).select(SESSION_INSTITUTION_FIELDS);
    if (!institution) {
      res.status(404).json({ message: 'Institution not found' });
      return;
    }

    res.json({ institution });
  } catch (err: any) {
    res.status(500).json({ message: err.message || 'Failed to update theme' });
  }
};
