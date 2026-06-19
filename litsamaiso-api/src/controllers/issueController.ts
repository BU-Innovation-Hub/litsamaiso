import type { Request, Response } from "express";
import Issue from "../models/Issue.js";
import { Account } from "../models/Account.js";
import { extractAccountCandidates } from "../services/geminiService.js";
import { notifyFinanceUsersAboutIssue } from "../services/accountService.js";

export const listIssuesForStudent = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user?.studentId) {
      res.status(400).json({ error: "Student ID is required" });
      return;
    }
    const issues = await Issue.find({
      studentId: user.studentId,
      status: { $nin: ["approved", "resolved"] },
    }).sort({ createdAt: -1 });
    res.json({ issues });
  } catch (err: any) {
    console.error("Error fetching issues:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

export const createIssue = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user?.studentId) {
      res.status(401).json({ error: "Not logged in" });
      return;
    }

    const { contractNumber, bankName, accountNumber, proofUrls, notes } = req.body;

    if (!contractNumber || !bankName || !accountNumber) {
      res.status(400).json({ error: "All fields are required" });
      return;
    }

    const smartBankName = bankName; // keep as-is; client normalizes where possible
    const recordedAccount = await Account.findOne({
      contractNumber,
      institution: user.institution,
    }).select("bankName accountNumber").lean();

    const updatePayload: any = {
      contractNumber,
      studentId: user.studentId,
      bankName: smartBankName,
      accountNumber,
      status: "submitted",
    };
    if (recordedAccount) {
      updatePayload.recordedBankName = recordedAccount.bankName;
      updatePayload.recordedAccountNumber = recordedAccount.accountNumber;
    }
    if (Array.isArray(proofUrls) && proofUrls.length) updatePayload.proofUrls = proofUrls;
    if (typeof notes === "string") updatePayload.notes = notes;

    const issue = await Issue.findOneAndUpdate({ contractNumber, studentId: user.studentId }, updatePayload, { upsert: true, new: true, setDefaultsOnInsert: true });

    // Notify finance (best-effort)
    try {
      await notifyFinanceUsersAboutIssue({
        institutionId: (req as any).user.institution,
        studentId: user.studentId,
        studentEmail: user.email,
        contractNumber,
        bankName: smartBankName,
        accountNumber,
        reasons: ["studentSubmitted"],
        notificationType: "created",
      });
    } catch (notifyErr) {
      console.warn("[Issue Notification Error]", notifyErr);
    }

    res.status(201).json({ message: "Issue recorded successfully.", issue });
  } catch (err: any) {
    console.error("Error creating issue:", err);
    res.status(500).json({ error: "Failed to create issue", details: err.message });
  }
};

export const deleteIssuesForStudent = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user?.studentId) {
      res.status(400).json({ error: "Student ID is required" });
      return;
    }
    const result = await Issue.deleteMany({ studentId: user.studentId });
    res.json({ message: "Issues deleted successfully.", deletedCount: result.deletedCount });
  } catch (err: any) {
    console.error("Error deleting issues:", err);
    res.status(500).json({ error: "Failed to delete issues", details: err.message });
  }
};

export const getIssueById = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const id = String(req.params.id || "");
    const issue = await Issue.findById(id).lean();
    if (!issue) {
      res.status(404).json({ error: "Issue not found" });
      return;
    }

    // allow finance to fetch any issue, student only their own
    const roleName = (user.role && (user.role as any).name) || user.role;
    if (String(roleName).toLowerCase() === "finance") {
      res.json({ issue });
      return;
    }

    if (!user?.studentId || issue.studentId !== user.studentId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    res.json({ issue });
  } catch (err: any) {
    console.error("Error fetching issue:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

export const updateIssueById = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const id = String(req.params.id || "");
    const issue = await Issue.findById(id);
    if (!issue) {
      res.status(404).json({ error: "Issue not found" });
      return;
    }

    const roleName = (user.role && (user.role as any).name) || user.role;
    const isFinance = String(roleName).toLowerCase() === "finance";
    const isOwner = user?.studentId && issue.studentId === user.studentId;

    if (!isFinance && !isOwner) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const { bankName, accountNumber, notes, proofUrls } = req.body || {};

    const updates: any = {};
    if (typeof bankName === "string" && bankName.trim() !== "") updates.bankName = bankName.trim();
    if (typeof accountNumber === "string" && accountNumber.trim() !== "") updates.accountNumber = accountNumber.trim();
    if (typeof notes === "string") updates.notes = notes;
    if (Array.isArray(proofUrls) && proofUrls.length) {
      // merge unique
      const existing = Array.isArray(issue.proofUrls) ? issue.proofUrls : [];
      updates.proofUrls = Array.from(new Set([...existing, ...proofUrls]));
    }

    if (!issue.recordedBankName || !issue.recordedAccountNumber) {
      const recordedAccount = issue.contractNumber
        ? await Account.findOne({
            contractNumber: issue.contractNumber,
            institution: user.institution,
          }).select("bankName accountNumber").lean()
        : null;
      if (recordedAccount) {
        if (!issue.recordedBankName) updates.recordedBankName = recordedAccount.bankName;
        if (!issue.recordedAccountNumber) updates.recordedAccountNumber = recordedAccount.accountNumber;
      }
    }

    updates.status = "submitted";

    const updated = await Issue.findByIdAndUpdate(id, { $set: updates }, { new: true, runValidators: true }).lean();
    if (!updated) {
      res.status(404).json({ error: "Issue not found" });
      return;
    }

    // Notify finance (best-effort)
    try {
      await notifyFinanceUsersAboutIssue({
        institutionId: (req as any).user.institution,
        studentId: updated.studentId,
        studentEmail: (req as any).user.email,
        contractNumber: updated.contractNumber || "",
        bankName: updated.correctedBankName || updated.bankName || "",
        accountNumber: updated.correctedAccountNumber || updated.accountNumber || "",
        reasons: ["studentUpdated"],
        notificationType: "updated",
      });
    } catch (notifyErr) {
      console.warn("[Issue Notification Error] update:", notifyErr);
    }

    res.json({ message: "Issue updated", issue: updated });
  } catch (err: any) {
    console.error("Error updating issue:", err);
    res.status(500).json({ error: "Failed to update issue", details: err.message });
  }
};
