import type { Request, Response } from "express";
import Issue from "../models/Issue.js";
import { extractAccountCandidates } from "../services/geminiService.js";
import { notifyFinanceUsersAboutIssue } from "../services/accountService.js";

export const listIssuesForStudent = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user?.studentId) {
      res.status(400).json({ error: "Student ID is required" });
      return;
    }
    const issues = await Issue.find({ studentId: user.studentId, status: { $ne: "approved" } }).sort({ createdAt: -1 });
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

    const updatePayload: any = {
      contractNumber,
      studentId: user.studentId,
      bankName: smartBankName,
      accountNumber,
      status: "submitted",
    };
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
