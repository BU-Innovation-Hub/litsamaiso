import XLSX from "xlsx";
import { Buffer } from "buffer";
import { FinancialClearance } from "../models/FinancialClearance.js";
import { Issue } from "../models/Issue.js";
import { Institution } from "../models/Institution.js";
import { Role } from "../models/Role.js";
import { User } from "../models/User.js";
import { Student } from "../models/Student.js";
import type { Types } from "mongoose";
import { getEmailBranding, sendEmail } from "../utils/email.js";
import React from "react";
import { render } from "@react-email/render";
import IssueNotificationEmail from "../emailTemplates/IssueNotificationEmail.js";

interface LoadResult {
  inserted: number;
  skipped: number;
  errors: string[];
  skippedDetails: { row: number; reasons: string[] }[];
}

interface LoadPaidResult {
  updated: number;
  skipped: number;
  errors: string[];
  skippedDetails: { row: number; reasons: string[] }[];
}

const REQUIRED_COLUMNS = [
  "borrowernumber",
  "accountnumber",
  "bankname",
  "courseofstudy",
  "fullnames",
];

const PAID_REQUIRED_COLUMNS = [...REQUIRED_COLUMNS, "status"];

const ACCOUNT_EXPORT_HEADERS = [
  "First Name",
  "Surname",
  "Full Names",
  "Borrower Number",
  "Course of Study",
  "Bank Name",
  "Account Number",
  "Student ID",
  "Status",
  "Graduating",
  "Batch Number",
  "Confirmation Date",
  "Paid Date",
  "Signature",
  "Created At",
  "Updated At",
] as const;

type AccountExportFormat = "csv" | "xlsx";

interface AccountQueryParams {
  search?: unknown;
  status?: unknown;
  batchNumber?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  institutionId?: unknown;
  limit?: unknown;
}

interface AccountExportResult {
  buffer: Buffer;
  contentType: string;
  filename: string;
}

const safeString = (value: unknown): string => String(value ?? "").trim();

const normalizeAccountStatus = (value: unknown): "pending" | "confirmed" | "erroneous" | "paid" => {
  const status = String(value || "").trim().toLowerCase();
  if (status === "confirmed" || status === "erroneous" || status === "paid") {
    return status;
  }
  return "pending";
};

const getUserRoleName = (user: any): string =>
  safeString((user?.role && (user.role as any).name) || user?.role);

const buildAccountFilter = (user: any, params: AccountQueryParams): Record<string, unknown> => {
  const q: any = {};
  const userRoleName = getUserRoleName(user);

  if (userRoleName.toLowerCase() === "appadmin") {
    const institutionId = safeString(params.institutionId);
    if (institutionId) {
      q.institution = institutionId;
    }
  } else {
    q.institution = user.institution;
  }

  const search = safeString(params.search);
  if (search) {
    q.$or = [
      { borrowerNumber: { $regex: search, $options: "i" } },
      { accountNumber: { $regex: search, $options: "i" } },
      { fullnames: { $regex: search, $options: "i" } },
    ];
  }

  const status = safeString(params.status);
  if (status) {
    if (status.toLowerCase() === "pending") {
      q.status = { $in: ["pending", "undefined", "", null] };
    } else {
      q.status = new RegExp(`^${escapeRegex(status)}$`, "i");
    }
  }

  const batchNumber = Number(params.batchNumber);
  if (Number.isFinite(batchNumber)) {
    q.batchNumber = batchNumber;
  }

  if (params.startDate || params.endDate) {
    q.confirmationDate = {};
    const startDate = safeString(params.startDate);
    const endDate = safeString(params.endDate);
    if (startDate) q.confirmationDate.$gte = new Date(startDate);
    if (endDate) q.confirmationDate.$lte = new Date(endDate);
  }

  return q;
};

export const getAccountListFilter = buildAccountFilter;

const parseAccountLimit = (value: unknown, fallback = 200, max = 2000): number => {
  const parsed = Number.parseInt(String(value || fallback), 10);
  return Math.min(Number.isFinite(parsed) && parsed > 0 ? parsed : fallback, max);
};

export const getAccountListLimit = parseAccountLimit;

const toIsoString = (value: unknown): string => {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
};

const splitFullName = (value: unknown): { firstName: string; surname: string } => {
  const parts = safeString(value).split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", surname: "" };
  return {
    firstName: parts[0] || "",
    surname: parts.slice(1).join(" "),
  };
};

const buildExportRows = (accounts: any[]) =>
  accounts.map((account) => {
    const confirmedBy = account.confirmedBy || {};
    const fallbackName = splitFullName(account.fullnames);
    const paidDate = account.paidAt || account.paidDate;

    return {
      "First Name": safeString(confirmedBy.name) || fallbackName.firstName,
      Surname: safeString(confirmedBy.surname) || fallbackName.surname,
      "Full Names": safeString(account.fullnames),
      "Borrower Number": safeString(account.borrowerNumber),
      "Course of Study": safeString(account.courseOfStudy),
      "Bank Name": safeString(account.bankName),
      "Account Number": safeString(account.accountNumber),
      "Student ID": safeString(confirmedBy.studentId),
      Status: safeString(account.status) || "pending",
      Graduating: account.graduating ? "Yes" : "No",
      "Batch Number": account.batchNumber ?? "",
      "Confirmation Date": toIsoString(account.confirmationDate),
      "Paid Date": toIsoString(paidDate),
      Signature: "",
      "Created At": toIsoString(account.createdAt),
      "Updated At": toIsoString(account.updatedAt),
    };
  });

export const exportAccounts = async (params: {
  user: any;
  query: AccountQueryParams;
  format: AccountExportFormat;
}): Promise<AccountExportResult> => {
  const filter = buildAccountFilter(params.user, params.query);
  const limit = parseAccountLimit(params.query.limit, 5000, 50000);
  const accounts = await FinancialClearance.find(filter)
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate("confirmedBy", "name surname studentId")
    .lean();

  const rows = buildExportRows(accounts);
  const worksheet = XLSX.utils.json_to_sheet(rows, {
    header: [...ACCOUNT_EXPORT_HEADERS],
  });

  const stamp = new Date().toISOString().slice(0, 10);

  if (params.format === "csv") {
    return {
      buffer: Buffer.from(XLSX.utils.sheet_to_csv(worksheet), "utf8"),
      contentType: "text/csv; charset=utf-8",
      filename: `accounts-export-${stamp}.csv`,
    };
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Accounts");

  return {
    buffer: XLSX.write(workbook, { bookType: "xlsx", type: "buffer" }),
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    filename: `accounts-export-${stamp}.xlsx`,
  };
};

export const loadAccountsFromExcel = async (
  fileBuffer: Buffer,
  institutionId: Types.ObjectId,
): Promise<LoadResult> => {
  const latestAccount = await FinancialClearance.findOne({ institution: institutionId })
    .sort({ batchNumber: -1, createdAt: -1 })
    .lean();
  const nextBatchNumber = Number(latestAccount?.batchNumber || 0) + 1;

  console.log(
    `[Accounts Service] Assigning batch number ${nextBatchNumber} for this import`,
  );

  const workbook = XLSX.read(fileBuffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("Excel file contains no sheets");
  const sheet = workbook.Sheets[sheetName];
  if (!sheet)
    throw new Error("Unable to read the first sheet of the Excel file");
  const raw: any[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });

  const rows = raw.map((row) => {
    const normalized: Record<string, any> = {};
    Object.keys(row).forEach((k) => {
      const key = String(k)
        .toLowerCase()
        .trim()
        .replace(/\s+/g, "")
        .replace(/[^a-z0-9]/g, "");
      normalized[key] = row[k];
    });
    return normalized;
  });

  const first = rows[0] || {};
  console.log(
    "[Accounts Service] Detected header keys (normalized):",
    Object.keys(first).join(", "),
  );
  const missing = REQUIRED_COLUMNS.filter((c) => !(c in first));
  if (missing.length > 0) {
    console.error(
      "[Accounts Service] Missing required columns:",
      missing.join(", "),
    );
    throw new Error(`Missing required columns: ${missing.join(", ")}`);
  }

  let inserted = 0;
  let skipped = 0;
  const errors: string[] = [];
  const skippedDetails: { row: number; reasons: string[] }[] = [];

  for (const [idx, row] of rows.entries()) {
    try {
      const missingFields = REQUIRED_COLUMNS.filter((c) => {
        const v = row[c];
        return v === null || v === undefined || String(v).trim() === "";
      });
      if (missingFields.length > 0) {
        skipped += 1;
        skippedDetails.push({
          row: idx + 2,
          reasons: [`Missing required fields: ${missingFields.join(", ")}`],
        });
        continue;
      }

      const borrowerNumber = String(row["borrowernumber"]).trim();
      const accountNumber = String(row["accountnumber"]).trim();
      const bankName = String(row["bankname"]).trim();
      const courseOfStudy = String(row["courseofstudy"]).trim();
      const fullnames = String(row["fullnames"]).trim();
      const graduatingRaw = row["graduating"];
      const gval =
        graduatingRaw === null || graduatingRaw === undefined
          ? ""
          : String(graduatingRaw).toLowerCase().trim();
      const graduating =
        gval === "true" || gval === "1" || gval === "yes" || gval === "y";
      const status = normalizeAccountStatus(row["status"]);
      const paidDateRaw = row["paiddate"];
      const paidDate = paidDateRaw ? new Date(paidDateRaw) : undefined;

      // skip duplicates within institution
      const exists = await FinancialClearance.findOne({
        institution: institutionId,
        $or: [{ borrowerNumber }, { accountNumber }],
      }).lean();
      if (exists) {
        skipped += 1;
        skippedDetails.push({
          row: idx + 2,
          reasons: ["Duplicate borrowerNumber or accountNumber"],
        });
        continue;
      }

      const payload: any = {
        borrowerNumber,
        accountNumber,
        bankName,
        batchNumber: nextBatchNumber,
        courseOfStudy,
        fullnames,
        graduating,
        status,
        paidDate:
          paidDate instanceof Date && !isNaN(paidDate.getTime())
            ? paidDate
            : undefined,
        institution: institutionId,
      };
      await FinancialClearance.create(payload);
      inserted += 1;
    } catch (err: any) {
      errors.push(`Row ${idx + 2}: ${err.message || String(err)}`);
    }
  }

  return { inserted, skipped, errors, skippedDetails };
};

export const loadPayedStudentsFromExcel = async (
  fileBuffer: Buffer,
  institutionId: Types.ObjectId,
): Promise<LoadPaidResult> => {
  const workbook = XLSX.read(fileBuffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("Excel file contains no sheets");
  const sheet = workbook.Sheets[sheetName];
  if (!sheet)
    throw new Error("Unable to read the first sheet of the Excel file");
  const raw: any[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });

  const rows = raw.map((row) => {
    const normalized: Record<string, any> = {};
    Object.keys(row).forEach((k) => {
      const key = String(k)
        .toLowerCase()
        .trim()
        .replace(/\s+/g, "")
        .replace(/[^a-z0-9]/g, "");
      normalized[key] = row[k];
    });
    return normalized;
  });

  const first = rows[0] || {};
  console.log(
    "[Accounts Service] Detected paid-import header keys (normalized):",
    Object.keys(first).join(", "),
  );
  const missing = PAID_REQUIRED_COLUMNS.filter((c) => !(c in first));
  if (missing.length > 0) {
    console.error(
      "[Accounts Service] Missing required columns for paid import:",
      missing.join(", "),
    );
    throw new Error(`Missing required columns: ${missing.join(", ")}`);
  }

  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];
  const skippedDetails: { row: number; reasons: string[] }[] = [];

  for (const [idx, row] of rows.entries()) {
    try {
      const missingFields = PAID_REQUIRED_COLUMNS.filter((c) => {
        const v = row[c];
        return v === null || v === undefined || String(v).trim() === "";
      });
      if (missingFields.length > 0) {
        skipped += 1;
        skippedDetails.push({
          row: idx + 2,
          reasons: [`Missing required fields: ${missingFields.join(", ")}`],
        });
        continue;
      }

      const borrowerNumber = String(row["borrowernumber"]).trim();
      const accountNumber = String(row["accountnumber"]).trim();
      const bankName = String(row["bankname"]).trim();
      const courseOfStudy = String(row["courseofstudy"]).trim();
      const fullnames = String(row["fullnames"]).trim();
      const status = String(row["status"]).trim().toLowerCase();

      if (status !== "paid") {
        skipped += 1;
        skippedDetails.push({
          row: idx + 2,
          reasons: ['Spreadsheet status must be "paid"'],
        });
        continue;
      }

      const account = await FinancialClearance.findOne({
        institution: institutionId,
        borrowerNumber,
      });

      if (!account) {
        skipped += 1;
        skippedDetails.push({
          row: idx + 2,
          reasons: ["Account not found for borrowerNumber"],
        });
        continue;
      }

      const matches =
        String(account.accountNumber || "").trim() === accountNumber &&
        String(account.bankName || "").trim().toLowerCase() ===
          bankName.toLowerCase() &&
        String(account.fullnames || "").trim().toLowerCase() ===
          fullnames.toLowerCase() &&
        String(account.courseOfStudy || "").trim().toLowerCase() ===
          courseOfStudy.toLowerCase();

      if (!matches) {
        skipped += 1;
        skippedDetails.push({
          row: idx + 2,
          reasons: ["Account details do not match the spreadsheet row"],
        });
        continue;
      }

      const currentStatus = String(account.status || "").trim().toLowerCase();
      if (currentStatus !== "confirmed") {
        skipped += 1;
        skippedDetails.push({
          row: idx + 2,
          reasons: [
            `Current account status must be confirmed before marking paid (found: ${account.status || "pending"})`,
          ],
        });
        continue;
      }

      account.status = "paid";
      account.paidAt = new Date();
      await account.save();
      updated += 1;
    } catch (err: any) {
      errors.push(`Row ${idx + 2}: ${err.message || String(err)}`);
    }
  }

  return { updated, skipped, errors, skippedDetails };
};

interface AccountConfirmationInput {
  borrowerNumber: string;
  bankName: string;
  accountNumber: string;
  institutionId: Types.ObjectId;
  studentId?: string;
  studentEmail?: string;
  graduating?: boolean;
  proofUrls?: string[];
  documentBase64?: string;
  documentMimeType?: string;
  documentFileName?: string;
}

interface AccountConfirmationResult {
  accountId: Types.ObjectId;
  confirmationDate: Date;
  status: string;
  alreadyConfirmed: boolean;
  graduating?: boolean;
}

const escapeRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const notifyFinanceUsersAboutIssue = async (input: {
  institutionId: Types.ObjectId;
  studentId: string;
  studentEmail: string;
  borrowerNumber: string;
  bankName: string;
  accountNumber: string;
  reasons: string[];
  notificationType: "created" | "updated";
}): Promise<void> => {
  try {
    const [institution, financeRole] = await Promise.all([
      Institution.findById(input.institutionId).select("name").lean(),
      Role.findOne({ name: new RegExp("^Finance$", "i") })
        .select("_id name")
        .lean(),
    ]);

    if (!financeRole) {
      console.warn(
        `[accountConfirmation] Finance role not found; skipping issue email for studentId=${input.studentId}`,
      );
      return;
    }

    const financeUsers = await User.find({
      institution: input.institutionId,
      role: financeRole._id,
    })
      .select("email")
      .lean();

    if (financeUsers.length === 0) {
      console.warn(
        `[accountConfirmation] No finance users found for institution=${String(input.institutionId)}; skipping issue email`,
      );
      return;
    }

    const institutionName = institution?.name || "Institution";
    const reasonText =
      input.reasons.length > 0 ? input.reasons.join(", ") : "unspecified";
    const actionLabel =
      input.notificationType === "created" ? "created" : "updated";
    const subject = `[${institutionName}] Account issue ${actionLabel} for ${input.studentId}`;
    const text = [
      `An account issue was ${actionLabel} for ${institutionName}.`,
      "",
      `Student ID: ${input.studentId}`,
      `Student Email: ${input.studentEmail}`,
      `Borrower Number: ${input.borrowerNumber}`,
      `Bank Name: ${input.bankName}`,
      `Account Number: ${input.accountNumber}`,
      `Reasons: ${reasonText}`,
    ].join("\n");
    const { appName, logoUrl, accentColor, attachments } = getEmailBranding();
    const html = await Promise.resolve(
      render(
        React.createElement(IssueNotificationEmail, {
          issue: {
            borrowerNumber: input.borrowerNumber,
            studentId: input.studentId,
            bankName: input.bankName,
            accountNumber: input.accountNumber,
            notes: `Student email: ${input.studentEmail}. Reasons: ${reasonText}.`,
          },
          appName,
          logoUrl,
          accentColor,
        }),
      ),
    );

    // Send branded notification to finance users.
    await sendEmail({
      to: (financeUsers.map((user) => user.email).filter(Boolean) as string[]),
      subject,
      text,
      html,
      attachments,
    });
  } catch (error) {
    console.warn(
      `[accountConfirmation] Failed to send finance issue notification for studentId=${input.studentId}:`,
      error,
    );
  }
};

export const accountConfirmation = async (
  input: AccountConfirmationInput,
): Promise<AccountConfirmationResult> => {
  const borrowerNumber = String(input.borrowerNumber || "").trim();
  const bankName = String(input.bankName || "").trim();
  const accountNumber = String(input.accountNumber || "").trim();

  console.log(
    `[accountConfirmation] Input: borrowerNumber=${borrowerNumber}, bankName=${bankName}, accountNumber=${accountNumber}`,
  );

  // Step 1: Validate required fields
  if (!borrowerNumber) {
    throw new Error("Enter your correct NMDS borrower's number");
  }
  if (!bankName || !accountNumber) {
    throw new Error("bankName and accountNumber are required");
  }

  // Step 2: Validate borrowerNumber exists in database
  if (!input.studentId) {
    throw new Error(
      "Student identifier (studentId) is required for confirmation",
    );
  }

  const student = await Student.findOne({
    institution: input.institutionId,
    studentId: input.studentId,
  });
  if (!student) {
    throw new Error("Student record not found for the logged in user");
  }

  // Find the account by borrowerNumber
  const accountByBorrowerNo = await FinancialClearance.findOne({
    institution: input.institutionId,
    borrowerNumber,
  });

  if (!accountByBorrowerNo) {
    console.log(
      `[accountConfirmation] Account not found for borrowerNumber: ${borrowerNumber}`,
    );
    throw new Error("Enter your correct NMDS borrower's number");
  }

  // Step 3: Check if bank and account match
  const accountMatches =
    String(accountByBorrowerNo.accountNumber || "").replace(/[^0-9]/g, "") ===
    String(accountNumber || "").replace(/[^0-9]/g, "");
  const bankMatches =
    String(accountByBorrowerNo.bankName || "").toLowerCase() ===
    String(bankName || "").toLowerCase();

  // Ensure the logged-in student's record maps to the provided borrower's number
  const studentContract = String(student.borrowerNumber || "").trim();
  const confirmedByMatches = !!(
    accountByBorrowerNo &&
    (accountByBorrowerNo as any).confirmedBy &&
    String((accountByBorrowerNo as any).confirmedBy) === String(student._id)
  );

  // Consider a student a match if:
  // - their stored borrowerNumber equals the provided borrowerNumber, OR
  // - they previously confirmed this account (confirmedBy), OR
  // - they have no stored borrowerNumber but are the logged-in student and the account's borrowerNumber matches the input
  const studentMatches =
    (studentContract !== "" && studentContract === borrowerNumber) ||
    confirmedByMatches ||
    (!studentContract &&
      String(input.studentId || "").trim() === String(student.studentId || "").trim() &&
      String(accountByBorrowerNo.borrowerNumber || "").trim() === borrowerNumber);

  if (!accountMatches || !bankMatches || !studentMatches) {
    console.log(
      `[accountConfirmation] Mismatch detected. Account match: ${accountMatches}, Bank match: ${bankMatches}, Student match: ${studentMatches}. Debug: student._id=${String(student._id)}, student.studentId=${String(student.studentId)}, student.borrowerNumber=${studentContract}, account.borrowerNumber=${String(accountByBorrowerNo.borrowerNumber)}, account.confirmedBy=${String((accountByBorrowerNo as any).confirmedBy) || "null"}, input.studentId=${String(input.studentId)}`,
    );

    const reasons: string[] = [];
    if (!studentMatches) reasons.push("studentIdMismatch");
    if (!accountMatches) reasons.push("accountNumberMismatch");
    if (!bankMatches) reasons.push("bankNameMismatch");

    // Create or update Issue for mismatches
    // If student provided proof URLs or a document, or they've already tried once,
    // create/update an Issue and notify finance. Otherwise, increment the student's
    // confirmationAttempts and ask them to upload proof and try again.
    const existingIssue = await Issue.findOne({ studentId: input.studentId });

    const hasProof = (Array.isArray(input.proofUrls) && input.proofUrls.length > 0) || Boolean(input.documentBase64);

    if (!hasProof && ( !(student as any).confirmationAttempts || (student as any).confirmationAttempts < 1 )) {
      // Give student a chance to upload proof first
      (student as any).confirmationAttempts = ((student as any).confirmationAttempts || 0) + 1;
      await (student as any).save();
      return { accountId: accountByBorrowerNo._id, confirmationDate: new Date(), status: 'mismatch', alreadyConfirmed: false, needsProof: true, message: 'Account details do not match. Please upload a clearer bank confirmation and try again.' } as any;
    }

    // Build issue payload
    const issuePayload: any = {
      borrowerNumber,
      studentId: input.studentId,
      bankName,
      accountNumber,
      recordedBankName: accountByBorrowerNo.bankName,
      recordedAccountNumber: accountByBorrowerNo.accountNumber,
      reasons,
      status: 'submitted',
    };

    if (Array.isArray(input.proofUrls) && input.proofUrls.length) issuePayload.proofUrls = input.proofUrls;
    if (input.documentBase64) {
      issuePayload.documentBase64 = input.documentBase64;
      issuePayload.documentMimeType = input.documentMimeType;
      issuePayload.documentFileName = input.documentFileName;
    }

    // Ensure borrowerNumber present
    if (!issuePayload.borrowerNumber) {
      throw new Error("[Critical] Cannot create/update Issue without borrowerNumber");
    }

    let issue: any = null;
    if (existingIssue) {
      issue = await Issue.findOneAndUpdate({ studentId: input.studentId }, { $set: issuePayload, $inc: { attempts: 1 } }, { new: true, runValidators: true });
      await notifyFinanceUsersAboutIssue({
        institutionId: input.institutionId,
        studentId: input.studentId,
        studentEmail: input.studentEmail || student.email,
        borrowerNumber,
        bankName,
        accountNumber,
        reasons,
        notificationType: 'updated',
      });
    } else {
      issue = await Issue.create(issuePayload);
      await notifyFinanceUsersAboutIssue({
        institutionId: input.institutionId,
        studentId: input.studentId,
        studentEmail: input.studentEmail || student.email,
        borrowerNumber,
        bankName,
        accountNumber,
        reasons,
        notificationType: 'created',
      });
    }

    // reset student's confirmation attempts after creating an issue
    (student as any).confirmationAttempts = 0;
    await (student as any).save();

    return { issueCreated: true, issue } as any;
  }

  // Step 4: Account details match - confirm
  const confirmedBy = (accountByBorrowerNo as any).confirmedBy;
  if (confirmedBy && String(confirmedBy) !== String(student._id)) {
    throw new Error("This account was already confirmed by another student");
  }

  const alreadyConfirmed =
    String(accountByBorrowerNo.status || "").toLowerCase() === "confirmed" &&
    confirmedBy &&
    String(confirmedBy) === String(student._id);

  const confirmationDate = new Date();
  let shouldSave = false;

  if (!alreadyConfirmed) {
    accountByBorrowerNo.status = "confirmed";
    (accountByBorrowerNo as any).confirmedBy = student._id;
    (accountByBorrowerNo as any).confirmationDate = confirmationDate;
    shouldSave = true;
  }

  if (typeof input.graduating === "boolean") {
    accountByBorrowerNo.graduating = input.graduating;
    shouldSave = true;
  }

  if (shouldSave) {
    await accountByBorrowerNo.save();
  }

  const result: AccountConfirmationResult = {
    accountId: accountByBorrowerNo._id,
    confirmationDate:
      (accountByBorrowerNo as any).confirmationDate || confirmationDate,
    status: accountByBorrowerNo.status || "confirmed",
    alreadyConfirmed,
  };

  if (typeof accountByBorrowerNo.graduating === "boolean") {
    result.graduating = accountByBorrowerNo.graduating;
  }

  return result;
};
