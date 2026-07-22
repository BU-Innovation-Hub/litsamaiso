import type { Request, Response } from "express";
import { BranchCode } from "../models/BranchCode.js";
import { recordAudit } from "../utils/auditLog.js";
import {
  getMissingBankNames,
  createMissingBranchCodes,
} from "../services/branchCodeService.js";

const getUserInstitution = (req: Request): string => {
  const user = (req as any).user;
  const roleName = ((user?.role && (user.role as any).name) || "").toLowerCase();
  // AppAdmin can manage branch codes across all institutions (query param)
  if (roleName === "appadmin" && req.query.institutionId) {
    return String(req.query.institutionId);
  }
  return String(user?.institution || "");
};

export const getBranchCodes = async (req: Request, res: Response) => {
  try {
    const institutionId = getUserInstitution(req);
    if (!institutionId) {
      res.status(400).json({ message: "Institution is required" });
      return;
    }

    const q: any = { institution: institutionId };
    const search = String(req.query.search || "").trim();
    if (search) {
      q.$or = [
        { bankName: { $regex: search, $options: "i" } },
        { branchCode: { $regex: search, $options: "i" } },
      ];
    }

    const branchCodes = await BranchCode.find(q)
      .sort({ bankName: 1 })
      .lean();

    res.json({ data: branchCodes });
  } catch (err: any) {
    console.error("[getBranchCodes] Error:", err);
    res.status(500).json({ message: err.message || String(err) });
  }
};

export const getBranchCodeById = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) {
      res.status(400).json({ message: "BranchCode id is required" });
      return;
    }

    const institutionId = getUserInstitution(req);
    const q: any = { _id: id };
    const roleName = ((req as any).user?.role && ((req as any).user.role as any).name || "").toLowerCase();
    if (roleName !== "appadmin") {
      q.institution = institutionId;
    }

    const entry = await BranchCode.findOne(q).lean();
    if (!entry) {
      res.status(404).json({ message: "BranchCode not found" });
      return;
    }

    res.json({ data: entry });
  } catch (err: any) {
    console.error("[getBranchCodeById] Error:", err);
    res.status(500).json({ message: err.message || String(err) });
  }
};

export const createBranchCode = async (req: Request, res: Response) => {
  const { bankName, branchCode, description } = req.body || {};
  const institutionId = getUserInstitution(req);
  try {

    if (!bankName || !String(bankName).trim()) {
      res.status(400).json({ message: "bankName is required" });
      return;
    }
    if (!branchCode || !String(branchCode).trim()) {
      res.status(400).json({ message: "branchCode is required" });
      return;
    }
    if (!institutionId) {
      res.status(400).json({ message: "Institution is required" });
      return;
    }

    const payload: Record<string, unknown> = {
      bankName: String(bankName).trim(),
      branchCode: String(branchCode).trim(),
      institution: institutionId,
    };
    if (description && String(description).trim()) {
      payload.description = String(description).trim();
    }
    const entry = await BranchCode.create(payload);

    const user = (req as any).user;
    await recordAudit({
      action: "branchCode.create",
      actorId: user._id?.toString(),
      actorEmail: user.email,
      actorRole: (user.role && (user.role as any).name) || undefined,
      targetCollection: "BranchCode",
      targetId: entry._id?.toString(),
      details: { bankName: entry.bankName, branchCode: entry.branchCode },
    });

    res.status(201).json({ message: "BranchCode created", data: entry });
  } catch (err: any) {
    if (err.code === 11000) {
      const conflictBank = String(bankName || "").trim();
      console.error(
        `[createBranchCode] 409 Duplicate key for institution=${institutionId}, bankName="${conflictBank}"`,
      );
      res.status(409).json({
        message: `A branch code for "${conflictBank}" already exists in this institution`,
        conflictBank,
      });
      return;
    }
    console.error("[createBranchCode] Error:", err);
    res.status(500).json({ message: err.message || String(err) });
  }
};

export const updateBranchCode = async (req: Request, res: Response) => {
  const id = String(req.params.id || "").trim();
  const { bankName, branchCode, description } = req.body || {};
  const setObj: any = {};
  const institutionId = getUserInstitution(req);
  try {
    if (!id) {
      res.status(400).json({ message: "BranchCode id is required" });
      return;
    }

    if (bankName !== undefined) setObj.bankName = String(bankName).trim();
    if (branchCode !== undefined) setObj.branchCode = String(branchCode).trim();
    if (description !== undefined) setObj.description = description ? String(description).trim() : undefined;

    if (Object.keys(setObj).length === 0) {
      res.status(400).json({ message: "No valid fields provided for update" });
      return;
    }

    const q: any = { _id: id };
    const roleName = ((req as any).user?.role && ((req as any).user.role as any).name || "").toLowerCase();
    if (roleName !== "appadmin") {
      q.institution = institutionId;
    }

    const entry = await BranchCode.findOneAndUpdate(
      q,
      { $set: setObj },
      { new: true, runValidators: true },
    );

    if (!entry) {
      res.status(404).json({ message: "BranchCode not found" });
      return;
    }

    const user = (req as any).user;
    await recordAudit({
      action: "branchCode.update",
      actorId: user._id?.toString(),
      actorEmail: user.email,
      actorRole: (user.role && (user.role as any).name) || undefined,
      targetCollection: "BranchCode",
      targetId: entry._id?.toString(),
      details: { updates: setObj },
    });

    res.json({ message: "BranchCode updated", data: entry });
  } catch (err: any) {
    if (err.code === 11000) {
      const conflictBank = String(setObj.bankName || "").trim();
      console.error(
        `[updateBranchCode] 409 Duplicate key for institution=${institutionId}, bankName="${conflictBank}"`,
      );
      res.status(409).json({
        message: `A branch code for "${conflictBank}" already exists in this institution`,
        conflictBank,
      });
      return;
    }
    console.error("[updateBranchCode] Error:", err);
    res.status(500).json({ message: err.message || String(err) });
  }
};

export const deleteBranchCode = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) {
      res.status(400).json({ message: "BranchCode id is required" });
      return;
    }

    const institutionId = getUserInstitution(req);
    const q: any = { _id: id };
    const roleName = ((req as any).user?.role && ((req as any).user.role as any).name || "").toLowerCase();
    if (roleName !== "appadmin") {
      q.institution = institutionId;
    }

    const entry = await BranchCode.findOneAndDelete(q).lean();
    if (!entry) {
      res.status(404).json({ message: "BranchCode not found" });
      return;
    }

    const user = (req as any).user;
    await recordAudit({
      action: "branchCode.delete",
      actorId: user._id?.toString(),
      actorEmail: user.email,
      actorRole: (user.role && (user.role as any).name) || undefined,
      targetCollection: "BranchCode",
      targetId: id,
      details: { bankName: entry.bankName, branchCode: entry.branchCode },
    });

    res.json({ message: "BranchCode deleted" });
  } catch (err: any) {
    console.error("[deleteBranchCode] Error:", err);
    res.status(500).json({ message: err.message || String(err) });
  }
};

export const getMissingBanks = async (req: Request, res: Response) => {
  try {
    const institutionId = getUserInstitution(req);
    if (!institutionId) {
      res.status(400).json({ message: "Institution is required" });
      return;
    }

    const missing = await getMissingBankNames(institutionId);
    res.json({ data: missing });
  } catch (err: any) {
    console.error("[getMissingBanks] Error:", err);
    res.status(500).json({ message: err.message || String(err) });
  }
};

export const createMissingBanks = async (req: Request, res: Response) => {
  try {
    const institutionId = getUserInstitution(req);
    if (!institutionId) {
      res.status(400).json({ message: "Institution is required" });
      return;
    }

    const result = await createMissingBranchCodes(institutionId);

    const user = (req as any).user;
    await recordAudit({
      action: "branchCode.createMissing",
      actorId: user._id?.toString(),
      actorEmail: user.email,
      actorRole: (user.role && (user.role as any).name) || undefined,
      targetCollection: "BranchCode",
      details: { created: result.created, bankNames: result.bankNames },
    });

    res.status(result.created > 0 ? 201 : 200).json({
      message: `${result.created} branch code(s) created with placeholder codes`,
      result,
    });
  } catch (err: any) {
    console.error("[createMissingBanks] Error:", err);
    res.status(500).json({ message: err.message || String(err) });
  }
};
