import type { Request, Response } from "express";
import {
  loadAccountsFromExcel,
  loadPayedStudentsFromExcel,
  accountConfirmation,
  notifyFinanceUsersAboutIssue,
} from "../services/accountService.js";
import { Institution } from "../models/Institution.js";
import { Issue } from "../models/Issue.js";
import { Student } from "../models/Student.js";
import { User } from "../models/User.js";
import { recordAudit } from "../utils/auditLog.js";
import { Account } from "../models/Account.js";
import { sendIssueResolvedEmail } from "../utils/email.js";

export const uploadAccounts = async (req: Request, res: Response) => {
  try {
    console.log("[Accounts Controller] POST /accounts/upload hit");
    console.log(
      "[Accounts Controller] headers:",
      Object.keys(req.headers).join(", "),
    );
    const file = (req as any).file;
    if (!file || !file.buffer) {
      console.log("[Accounts Controller] Missing file upload");
      res.status(400).json({ message: "Missing file upload" });
      return;
    }

    const user = (req as any).user;
    const instId = user.institution;

    const inst = await Institution.findById(instId);
    if (!inst) {
      console.log(
        "[Accounts Controller] Institution not found for user",
        instId,
      );
      res.status(400).json({ message: "User institution not found" });
      return;
    }

    console.log(
      "[Accounts Controller] Starting accounts import for institution",
      String(instId),
    );
    const result = await loadAccountsFromExcel(file.buffer, instId);
    console.log("[Accounts Controller] Import result:", result);
    res.json({ message: "Import completed", result });
  } catch (err: any) {
    console.error("[Accounts Controller] Error during upload:", err);
    res.status(500).json({ message: err.message || String(err) });
  }
};

export const listAccounts = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const params = req.query || {} as any;

    // pagination / limit
    const limit = Math.min(parseInt(String(params.limit || "200"), 10) || 200, 2000);

    // determine institution scope:
    // - AppAdmin: if `institutionId` query provided, scope to that; otherwise no institution filter (see all)
    // - Others: scope to the user's institution
    let institutionFilter: any = {};
    const userRoleName = (user.role && (user.role as any).name) || (user.role as string) || "";
    if (String(userRoleName).toLowerCase() === "appadmin") {
      if (params.institutionId) {
        institutionFilter.institution = params.institutionId;
      }
    } else {
      institutionFilter.institution = user.institution;
    }

    const q: any = { ...institutionFilter };

    if (params.search) {
      const s = String(params.search).trim();
      q.$or = [
        { contractNumber: { $regex: s, $options: "i" } },
        { accountNumber: { $regex: s, $options: "i" } },
        { fullnames: { $regex: s, $options: "i" } },
      ];
    }

    if (params.status) {
      const s = String(params.status).trim();
      // Include legacy rows where blank imports were previously stored as "undefined".
      if (s.toLowerCase() === 'pending') {
        q.status = { $in: ['pending', 'undefined', '', null] };
      } else {
        // allow case-insensitive match for other statuses
        q.status = new RegExp(`^${s}$`, 'i');
      }
    }

    if (params.batchNumber) {
      const bn = parseInt(String(params.batchNumber), 10);
      if (!Number.isNaN(bn)) q.batchNumber = bn;
    }

    // date range filter (applies to confirmationDate if provided)
    if (params.startDate || params.endDate) {
      q.confirmationDate = {} as any;
      if (params.startDate) q.confirmationDate.$gte = new Date(String(params.startDate));
      if (params.endDate) q.confirmationDate.$lte = new Date(String(params.endDate));
    }

    const accounts = await Account.find(q).limit(limit).lean();

    // compute batches list
    const batches = Array.from(new Set((accounts || []).map((a: any) => a.batchNumber))).sort((a, b) => a - b);

    res.json({ accounts, batches });
  } catch (err: any) {
    console.error("[listAccounts] Error:", err);
    res.status(500).json({ message: err.message || String(err) });
  }
};

export const loadPayedStudents = async (req: Request, res: Response) => {
  try {
    console.log("[Accounts Controller] POST /accounts/load_payed_students hit");
    const file = (req as any).file;
    if (!file || !file.buffer) {
      res.status(400).json({ message: "Missing file upload" });
      return;
    }

    const user = (req as any).user;
    const instId = user.institution;

    const inst = await Institution.findById(instId);
    if (!inst) {
      res.status(400).json({ message: "User institution not found" });
      return;
    }

    const result = await loadPayedStudentsFromExcel(file.buffer, instId);
    res.json({ message: "Paid accounts import completed", result });
  } catch (err: any) {
    console.error("[Accounts Controller] Error during paid upload:", err);
    res.status(500).json({ message: err.message || String(err) });
  }
};

export const confirmAccount = async (req: Request, res: Response) => {
  try {
    console.log("[confirmAccount] POST /accounts/confirm hit");
    const body = (req.body || {}) as {
      contractNumber?: string;
      bankName?: string;
      accountNumber?: string;
      graduating?: boolean | string;
    };
    const { contractNumber, bankName, accountNumber, graduating } = body;

    console.log(
      `[confirmAccount] Input: contractNumber=${contractNumber}, bankName=${bankName}, accountNumber=${accountNumber}`,
    );

    if (!contractNumber || String(contractNumber).trim() === "") {
      res
        .status(400)
        .json({ message: "Enter your correct NMDS contract number" });
      return;
    }

    const user = (req as any).user;
    const instId = user.institution;

    let graduatingFlag: boolean | undefined;
    if (graduating !== undefined) {
      if (typeof graduating === "boolean") {
        graduatingFlag = graduating;
      } else if (typeof graduating === "string") {
        const normalized = graduating.toLowerCase().trim();
        if (["true", "1", "yes", "y"].includes(normalized)) {
          graduatingFlag = true;
        } else if (["false", "0", "no", "n"].includes(normalized)) {
          graduatingFlag = false;
        } else {
          throw new Error("graduating must be a boolean");
        }
      } else {
        throw new Error("graduating must be a boolean");
      }
    }

    let confirmationInput: {
      contractNumber: string;
      bankName: string;
      accountNumber: string;
      institutionId: typeof instId;
      studentId?: string;
      studentEmail?: string;
      graduating?: boolean;
    } = {
      contractNumber: String(contractNumber || ""),
      bankName: String(bankName || ""),
      accountNumber: String(accountNumber || ""),
      institutionId: instId,
      studentId: user.studentId,
      studentEmail: user.email,
    };

    if (typeof graduatingFlag === "boolean") {
      confirmationInput.graduating = graduatingFlag;
    }

    // If student uploaded a document during confirm, attempt to upload it and include proofUrls
    const document = (req as any).file as
      | {
          buffer: Buffer;
          mimetype: string;
          originalname: string;
        }
      | undefined;

    if (document && document.buffer) {
      try {
        const { uploadImageBuffer } = await import("../utils/cloudinary.js");
        const uploadRes = await uploadImageBuffer({ buffer: document.buffer, fileName: document.originalname, folder: "issues" });
        confirmationInput = { ...confirmationInput, proofUrls: [uploadRes.url] } as any;
      } catch (uErr) {
        // fallback to embedding base64 in the issue payload
        confirmationInput = {
          ...confirmationInput,
          documentBase64: document.buffer.toString("base64"),
          documentMimeType: document.mimetype,
          documentFileName: document.originalname,
        } as any;
      }
    }

    const result = await accountConfirmation(confirmationInput as any);

    // Audit: account confirmation attempt/result
    await recordAudit({
      action: "account.confirm",
      actorId: user._id?.toString(),
      actorEmail: user.email,
      actorRole: (user.role && (user.role as any).name) || undefined,
      targetCollection: "Account",
      targetId: result?.accountId?.toString(),
      details: {
        contractNumber,
        bankName,
        accountNumber,
        alreadyConfirmed: result.alreadyConfirmed,
      },
    });

    // accountConfirmation may return a special result when it created an Issue or when proof is required
    if ((result as any).issueCreated) {
      res.status(201).json({ message: "Issue created for finance review", issue: (result as any).issue });
      return;
    }
    if ((result as any).needsProof) {
      res.status(400).json({ message: (result as any).message || "Account details do not match. Please upload proof and try again.", needsProof: true });
      return;
    }

    res.json({
      message: result.alreadyConfirmed
        ? "Account already confirmed"
        : "Account confirmed",
      result,
    });
  } catch (err: any) {
    console.error("[confirmAccount] Error:", err.message || String(err));
    // Audit failed confirmation
    await recordAudit({
      action: "account.confirm.failed",
      actorId: (req as any).user?._id?.toString(),
      actorEmail: (req as any).user?.email,
      actorRole:
        ((req as any).user &&
          (req as any).user.role &&
          (req as any).user.role.name) ||
        (req as any).user?.role,
      targetCollection: "Account",
      details: {
        bankName: (req as any).body?.bankName,
        accountNumber: (req as any).body?.accountNumber,
        error: err.message || String(err),
      },
    });

    res.status(400).json({ message: err.message || String(err) });
  }
};

export const getConfirmationStatus = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const instId = user.institution;

    if (!user.studentId) {
      res.status(400).json({ message: "Student identifier (studentId) is required" });
      return;
    }

    const student = await Student.findOne({ institution: instId, studentId: user.studentId }).lean();
    if (!student) {
      res.status(404).json({ message: "Student record not found" });
      return;
    }

    let account = null as any;
    if (student.contractNumber) {
      account = await Account.findOne({ institution: instId, contractNumber: student.contractNumber }).lean();
    }

    if (!account) {
      // fallback: find account confirmed by this student id
      const stud = await Student.findOne({ institution: instId, studentId: user.studentId }).lean();
      if (stud && stud._id) {
        account = await Account.findOne({ institution: instId, confirmedBy: stud._id }).lean();
      }
    }

    if (!account) {
      res.json({ confirmed: false });
      return;
    }

    const confirmed = String(account.status || "").toLowerCase() === "confirmed" && account.confirmedBy && String((account as any).confirmedBy) === String(student._id);

    res.json({ confirmed, status: account.status, confirmationDate: account.confirmationDate });
  } catch (err: any) {
    console.error("getConfirmationStatus error:", err);
    res.status(500).json({ message: err.message || String(err) });
  }
};

export const getStudentAccounts = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const instId = user.institution;

    if (!user?.studentId) {
      res.status(400).json({ message: 'Student identifier (studentId) is required' });
      return;
    }

    const student = await Student.findOne({ institution: instId, studentId: user.studentId }).lean();
    if (!student) {
      res.status(404).json({ message: 'Student record not found' });
      return;
    }

    const q: any = { institution: instId };
    const or: any[] = [];
    if (student.contractNumber) {
      or.push({ contractNumber: student.contractNumber });
    }
    // accounts confirmed by this student
    if (student._id) {
      or.push({ confirmedBy: student._id });
    }

    if (or.length > 0) q.$or = or;

    const accounts = await Account.find(q).lean();
    res.json({ data: accounts });
  } catch (err: any) {
    console.error('[getStudentAccounts] Error:', err);
    res.status(500).json({ message: err.message || String(err) });
  }
};

export const resolveAccountIssue = async (req: Request, res: Response) => {
  try {
    const resolvedBody = (req.body || {}) as {
      correctedBankName?: string;
      correctedAccountNumber?: string;
    };
    const { correctedBankName, correctedAccountNumber } = resolvedBody;

    const user = (req as any).user;
    const instId = user.institution;

    if (!user.studentId) {
      res.status(400).json({ message: "Logged-in user has no studentId" });
      return;
    }

    const correctedBank = String(correctedBankName || "").trim();
    const correctedAccount = String(correctedAccountNumber || "").trim();

    if (!correctedBank || !correctedAccount) {
      res.status(400).json({
        message: "correctedBankName and correctedAccountNumber are required",
      });
      return;
    }

    const document = (req as any).file as
      | {
          buffer: Buffer;
          mimetype: string;
          originalname: string;
        }
      | undefined;

    if (!document || !document.buffer) {
      res.status(400).json({ message: "Missing document upload" });
      return;
    }

    const student = await Student.findOne({
      institution: instId,
      studentId: user.studentId,
    }).lean();

    if (!student) {
      res.status(404).json({ message: "Student record not found" });
      return;
    }

    const setUpdates: {
      contractNumber?: string;
      correctedBankName: string;
      correctedAccountNumber: string;
      documentBase64: string;
      documentMimeType: string;
      documentFileName: string;
      reasons: string[];
    } = {
      correctedBankName: correctedBank,
      correctedAccountNumber: correctedAccount,
      documentBase64: document.buffer.toString("base64"),
      documentMimeType: document.mimetype,
      documentFileName: document.originalname,
      reasons: ["studentResolutionSubmitted"],
    };

    // Check if Issue exists first
    const existingIssue = await Issue.findOne({
      studentId: user.studentId,
    }).lean();

    const issuePayload: any = { ...setUpdates };
    if (student.contractNumber) {
      issuePayload.contractNumber = student.contractNumber;
    }

    const recordContractNumber = String(issuePayload.contractNumber || existingIssue?.contractNumber || "").trim();
    if (recordContractNumber) {
      const recordedAccount = await Account.findOne({
        contractNumber: recordContractNumber,
        institution: instId,
      }).select("bankName accountNumber").lean();

      if (recordedAccount) {
        issuePayload.recordedBankName = existingIssue?.recordedBankName || recordedAccount.bankName;
        issuePayload.recordedAccountNumber = existingIssue?.recordedAccountNumber || recordedAccount.accountNumber;
      }
    }

    const studentUser = await User.findOne({ studentId: user.studentId })
      .select("email")
      .lean();

    if (existingIssue) {
      // Update existing Issue
      await Issue.findOneAndUpdate(
        { studentId: user.studentId },
        { $set: issuePayload },
        { new: true, runValidators: true },
      );
      await notifyFinanceUsersAboutIssue({
        institutionId: instId,
        studentId: user.studentId,
        studentEmail: studentUser?.email || user.email,
        contractNumber: String(
          issuePayload.contractNumber || existingIssue.contractNumber || "",
        ),
        bankName: String(issuePayload.correctedBankName || ""),
        accountNumber: String(issuePayload.correctedAccountNumber || ""),
        reasons: issuePayload.reasons,
        notificationType: "updated",
      });
    } else {
      // Create new Issue (contractNumber optional for student submissions)
      console.log(
        `[resolveAccountIssue] Creating new Issue with payload:`,
        JSON.stringify(issuePayload, null, 2),
      );
      await Issue.create(issuePayload);
      await notifyFinanceUsersAboutIssue({
        institutionId: instId,
        studentId: user.studentId,
        studentEmail: studentUser?.email || user.email,
        contractNumber: String(issuePayload.contractNumber || ""),
        bankName: String(issuePayload.correctedBankName || ""),
        accountNumber: String(issuePayload.correctedAccountNumber || ""),
        reasons: issuePayload.reasons,
        notificationType: "created",
      });
    }

    await recordAudit({
      action: "issue.submit",
      actorId: user._id?.toString(),
      actorEmail: user.email,
      actorRole: (user.role && (user.role as any).name) || undefined,
      targetCollection: "Issue",
      targetId: user.studentId,
      details: {
        correctedBankName: correctedBank,
        correctedAccountNumber: correctedAccount,
      },
    });

    res.status(201).json({
      message:
        "Details sent to Finance department, and they will resolve the issue",
    });
  } catch (err: any) {
    // Audit failed student resolve submission
    await recordAudit({
      action: "issue.submit.failed",
      actorId: (req as any).user?._id?.toString(),
      actorEmail: (req as any).user?.email,
      actorRole:
        ((req as any).user &&
          (req as any).user.role &&
          (req as any).user.role.name) ||
        (req as any).user?.role,
      targetCollection: "Issue",
      targetId: (req as any).user?.studentId,
      details: {
        correctedBankName: (req as any).body?.correctedBankName,
        correctedAccountNumber: (req as any).body?.correctedAccountNumber,
        error: err.message || String(err),
      },
    });

    res.status(400).json({ message: err.message || String(err) });
  }
};

export const financeResolveAccountIssue = async (
  req: Request,
  res: Response,
) => {
  try {
    const financeBody = (req.body || {}) as { studentId?: string };
    const { studentId } = financeBody;

    const financeUser = (req as any).user;
    const instId = financeUser.institution;

    const targetStudentId = String(studentId || "").trim();
    if (!targetStudentId) {
      res.status(400).json({ message: "studentId is required" });
      return;
    }

    const issue = await Issue.findOne({ studentId: targetStudentId });
    if (!issue) {
      res.status(404).json({ message: "Issue not found for studentId" });
      return;
    }

    const correctedBankName = String(issue.correctedBankName || "").trim();
    const correctedAccountNumber = String(
      issue.correctedAccountNumber || "",
    ).trim();

    if (!correctedBankName || !correctedAccountNumber) {
      res.status(400).json({
        message:
          "Issue does not contain correctedBankName and correctedAccountNumber",
      });
      return;
    }

    const student = await Student.findOne({
      institution: instId,
      studentId: targetStudentId,
    }).lean();

    if (!student) {
      res.status(404).json({ message: "Student record not found" });
      return;
    }

    const issueContractNumber = String(issue.contractNumber || "").trim();
    if (!issueContractNumber) {
      res
        .status(400)
        .json({ message: "Issue does not contain contractNumber" });
      return;
    }

    const account = await Account.findOne({
      institution: instId,
      contractNumber: issueContractNumber,
    });

    if (!account) {
      res.status(404).json({ message: "Account not found for contractNumber" });
      return;
    }

    const prev = {
      bankName: account.bankName,
      accountNumber: account.accountNumber,
    };

    account.bankName = correctedBankName;
    account.accountNumber = correctedAccountNumber;
    await account.save();

    issue.status = "resolved";
    (issue as any).approvedBy = financeUser._id;
    (issue as any).approvedAt = new Date();
    await issue.save();

    const studentUser = await User.findOne({ studentId: targetStudentId })
      .select("email")
      .lean();

    if (studentUser?.email) {
      const institution = await Student.findOne({
        institution: instId,
        studentId: targetStudentId,
      })
        .select("institution")
        .populate("institution", "name")
        .lean();

      await sendIssueResolvedEmail({
        to: studentUser.email,
        studentId: targetStudentId,
        institutionName: (institution as any)?.institution?.name,
      });
    } else {
      console.warn(
        `[financeResolveAccountIssue] No user email found for studentId=${targetStudentId}; skipping issue resolved notification`,
      );
    }

    await recordAudit({
      action: "issue.resolve.applied",
      actorId: financeUser._id?.toString(),
      actorEmail: financeUser.email,
      actorRole:
        (financeUser.role && (financeUser.role as any).name) || undefined,
      targetCollection: "Account",
      targetId: account._id?.toString(),
      details: {
        studentId: targetStudentId,
        prev,
        updated: {
          bankName: correctedBankName,
          accountNumber: correctedAccountNumber,
        },
      },
    });

    res.json({ message: "Account updated from issue details" });
  } catch (err: any) {
    // Audit failed finance resolve
    await recordAudit({
      action: "issue.resolve.failed",
      actorId: (req as any).user?._id?.toString(),
      actorEmail: (req as any).user?.email,
      actorRole:
        ((req as any).user &&
          (req as any).user.role &&
          (req as any).user.role.name) ||
        (req as any).user?.role,
      targetCollection: "Issue",
      targetId: (req as any).body?.studentId,
      details: { error: err.message || String(err) },
    });

    res.status(400).json({ message: err.message || String(err) });
  }
};

// Update an account by id (allowed for AppAdmin, InstitutionAdmin, Finance)
export const updateAccount = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ message: "Account id is required" });

    const user = (req as any).user;
    const instId = user.institution;

    const updates = req.body || {};

    // Only allow certain fields to be updated via this endpoint
    const allowed: Array<string> = [
      "fullnames",
      "contractNumber",
      "courseOfStudy",
      "bankName",
      "accountNumber",
      "batchNumber",
      "graduating",
      "status",
    ];

    const setObj: any = {};
    for (const k of Object.keys(updates)) {
      if (allowed.includes(k)) setObj[k] = k === "status" && String(updates[k] || "").trim() === "" ? "pending" : updates[k];
    }

    if (Object.keys(setObj).length === 0) {
      return res.status(400).json({ message: "No valid fields provided for update" });
    }

    // find account scoped to institution (AppAdmin may provide institution filter via query)
    const q: any = { _id: id };
    if (!((user.role && (user.role as any).name) || "").toLowerCase().includes("appadmin")) {
      q.institution = instId;
    }

    const account = await Account.findOne(q);
    if (!account) return res.status(404).json({ message: "Account not found" });

    for (const key of Object.keys(setObj)) {
      (account as any)[key] = setObj[key];
    }

    // if status set to confirmed, update confirmation metadata if student context provided
    if (setObj.status && String(setObj.status).toLowerCase() === "confirmed") {
      account.confirmationDate = new Date();
      // if request includes confirmedByStudentId, try to set confirmedBy
      if ((req.body as any).confirmedByStudentId) {
        const stud = await Student.findOne({ institution: instId, studentId: String((req.body as any).confirmedByStudentId) });
        if (stud) account.confirmedBy = stud._id;
      }
    }

    await account.save();

    await recordAudit({
      action: "account.update",
      actorId: user._id?.toString(),
      actorEmail: user.email,
      actorRole: (user.role && (user.role as any).name) || undefined,
      targetCollection: "Account",
      targetId: account._id?.toString(),
      details: { updates: setObj },
    });

    res.json({ message: "Account updated", account });
  } catch (err: any) {
    console.error("updateAccount error:", err);
    res.status(500).json({ message: err.message || String(err) });
  }
};
