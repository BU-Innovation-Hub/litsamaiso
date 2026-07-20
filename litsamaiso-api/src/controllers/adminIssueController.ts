import type { Request, Response } from "express";
import Issue from "../models/Issue.js";
import { FinancialClearance } from "../models/FinancialClearance.js";
import { Student } from "../models/Student.js";
import { User } from "../models/User.js";
import { sendIssueStatusToStudent } from "../utils/email.js";
import { recordAudit } from "../utils/auditLog.js";

export const listAdminIssues = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const params = req.query || {} as any;

    // restrict to issues submitted for students in this institution
    const studentDocs = await Student.find({ institution: user.institution }).select("studentId name email").lean();
    const studentIds = (studentDocs || []).map((s) => s.studentId).filter(Boolean);

    const q: any = { studentId: { $in: studentIds } };
    if (params.status) q.status = String(params.status);
    if (params.search) {
      const s = String(params.search).trim();
      q.$or = [
        { borrowerNumber: { $regex: s, $options: "i" } },
        { studentId: { $regex: s, $options: "i" } },
        { bankName: { $regex: s, $options: "i" } },
      ];
    }

    const issues = await Issue.find(q).sort({ createdAt: -1 }).lean();

    // attach account and student info
    const studentMap: Record<string, any> = {};
    for (const s of studentDocs) studentMap[String(s.studentId)] = s;

    const results = await Promise.all(
      issues.map(async (it) => {
        const acc = it.borrowerNumber
          ? await FinancialClearance.findOne({ borrowerNumber: it.borrowerNumber, institution: user.institution }).lean()
          : null;
        return { ...it, account: acc || null, student: studentMap[String(it.studentId)] || null };
      }),
    );

    res.json({ data: results });
  } catch (err: any) {
    console.error("[adminIssue] list error:", err);
    res.status(500).json({ error: err.message || String(err) });
  }
};

export const getAdminIssue = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const id = String(req.params.id || "");
    const issue = await Issue.findById(id).lean();
    if (!issue) {
      res.status(404).json({ error: "Issue not found" });
      return;
    }

    const student = await Student.findOne({ studentId: issue.studentId, institution: user.institution }).select("studentId name email").lean();
    if (!student) {
      res.status(404).json({ error: "Issue not found for your institution" });
      return;
    }

    const account = issue.borrowerNumber
      ? await FinancialClearance.findOne({ borrowerNumber: issue.borrowerNumber, institution: user.institution }).lean()
      : null;

    res.json({ data: { ...issue, account, student } });
  } catch (err: any) {
    console.error("[adminIssue] get error:", err);
    res.status(500).json({ error: err.message || String(err) });
  }
};

export const approveIssue = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const id = String(req.params.id || "");
    const issue = await Issue.findById(id);
    if (!issue) return res.status(404).json({ error: "Issue not found" });

    // ensure the student belongs to this institution
    const student = await Student.findOne({ studentId: issue.studentId, institution: user.institution }).lean();
    if (!student) return res.status(404).json({ error: "Student not found in your institution" });

    const borrowerNumber = String(issue.borrowerNumber || student.borrowerNumber || "").trim();
    if (!borrowerNumber) return res.status(400).json({ error: "Issue missing borrowerNumber" });

    const correctedBank = String(issue.correctedBankName || issue.bankName || "").trim();
    const correctedAccount = String(issue.correctedAccountNumber || issue.accountNumber || "").trim();
    if (!correctedBank || !correctedAccount) return res.status(400).json({ error: "Issue has no corrected bank/account to apply" });

    const account = await FinancialClearance.findOne({ borrowerNumber, institution: user.institution });
    if (!account) return res.status(404).json({ error: "Account not found for borrowerNumber" });

    const prev = { bankName: account.bankName, accountNumber: account.accountNumber };

    account.bankName = correctedBank;
    account.accountNumber = correctedAccount;
    account.status = "confirmed";
    account.confirmedBy = student._id;
    account.confirmationDate = new Date();
    await account.save();

    issue.status = "resolved";
    (issue as any).approvedBy = user._id;
    (issue as any).approvedAt = new Date();
    await issue.save();

    // notify student
    try {
      await sendIssueStatusToStudent(issue.toObject(), "approved");
    } catch (notifyErr) {
      console.warn("[adminIssue] sendIssueStatusToStudent failed:", notifyErr);
    }

    await recordAudit({
      action: "issue.approve",
      actorId: user._id?.toString(),
      actorEmail: user.email,
      actorRole: (user.role && (user.role as any).name) || undefined,
      targetCollection: "FinancialClearance",
      targetId: account._id?.toString(),
      details: { studentId: issue.studentId, prev, updated: { bankName: correctedBank, accountNumber: correctedAccount } },
    });

    res.json({ message: "Issue approved and account updated" });
  } catch (err: any) {
    console.error("[adminIssue] approve error:", err);
    res.status(500).json({ error: err.message || String(err) });
  }
};

export const rejectIssue = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const id = String(req.params.id || "");
    const { reason } = req.body || {};

    const issue = await Issue.findById(id);
    if (!issue) return res.status(404).json({ error: "Issue not found" });

    // ensure issue is for this institution
    const student = await Student.findOne({ studentId: issue.studentId, institution: user.institution }).lean();
    if (!student) return res.status(404).json({ error: "Issue not found for your institution" });

    issue.status = "rejected";
    (issue as any).rejectedBy = user._id;
    (issue as any).rejectedAt = new Date();
    if (reason) {
      issue.notes = (issue.notes ? issue.notes + "\n" : "") + String(reason);
    }
    await issue.save();

    try {
      await sendIssueStatusToStudent(issue.toObject(), "rejected", reason);
    } catch (notifyErr) {
      console.warn("[adminIssue] sendIssueStatusToStudent failed:", notifyErr);
    }

    await recordAudit({
      action: "issue.reject",
      actorId: user._id?.toString(),
      actorEmail: user.email,
      actorRole: (user.role && (user.role as any).name) || undefined,
      targetCollection: "Issue",
      targetId: id,
      details: { studentId: issue.studentId, reason },
    });

    res.json({ message: "Issue rejected" });
  } catch (err: any) {
    console.error("[adminIssue] reject error:", err);
    res.status(500).json({ error: err.message || String(err) });
  }
};
