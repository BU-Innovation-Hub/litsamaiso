import XLSX from "xlsx";
import { Buffer } from "buffer";
import { Account } from "../models/Account.js";
import { Issue } from "../models/Issue.js";
import { Institution } from "../models/Institution.js";
import { Role } from "../models/Role.js";
import { User } from "../models/User.js";
import { Student } from "../models/Student.js";
import type { Types } from "mongoose";
import { sendEmail } from "../utils/email.js";

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
  "contractnumber",
  "accountnumber",
  "bankname",
  "courseofstudy",
  "fullnames",
];

const PAID_REQUIRED_COLUMNS = [...REQUIRED_COLUMNS, "status"];

export const loadAccountsFromExcel = async (
  fileBuffer: Buffer,
  institutionId: Types.ObjectId,
): Promise<LoadResult> => {
  const latestAccount = await Account.findOne({ institution: institutionId })
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

      const contractNumber = String(row["contractnumber"]).trim();
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
      const status = String(row["status"]).trim();
      const paidDateRaw = row["paiddate"];
      const paidDate = paidDateRaw ? new Date(paidDateRaw) : undefined;

      // skip duplicates within institution
      const exists = await Account.findOne({
        institution: institutionId,
        $or: [{ contractNumber }, { accountNumber }],
      }).lean();
      if (exists) {
        skipped += 1;
        skippedDetails.push({
          row: idx + 2,
          reasons: ["Duplicate contractNumber or accountNumber"],
        });
        continue;
      }

      const payload: any = {
        contractNumber,
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
      await Account.create(payload);
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

      const contractNumber = String(row["contractnumber"]).trim();
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

      const account = await Account.findOne({
        institution: institutionId,
        contractNumber,
      });

      if (!account) {
        skipped += 1;
        skippedDetails.push({
          row: idx + 2,
          reasons: ["Account not found for contractNumber"],
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
            `Current account status must be confirmed before marking paid (found: ${account.status || "undefined"})`,
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
  contractNumber: string;
  bankName: string;
  accountNumber: string;
  institutionId: Types.ObjectId;
  studentId?: string;
  studentEmail?: string;
  graduating?: boolean;
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
  contractNumber: string;
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
      `Contract Number: ${input.contractNumber}`,
      `Bank Name: ${input.bankName}`,
      `Account Number: ${input.accountNumber}`,
      `Reasons: ${reasonText}`,
    ].join("\n");
    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">
        <h2 style="margin: 0 0 16px;">Account issue ${actionLabel}</h2>
        <p>An account issue was ${actionLabel} for <strong>${institutionName}</strong>.</p>
        <ul>
          <li><strong>Student ID:</strong> ${input.studentId}</li>
          <li><strong>Student Email:</strong> ${input.studentEmail}</li>
          <li><strong>Contract Number:</strong> ${input.contractNumber}</li>
          <li><strong>Bank Name:</strong> ${input.bankName}</li>
          <li><strong>Account Number:</strong> ${input.accountNumber}</li>
          <li><strong>Reasons:</strong> ${reasonText}</li>
        </ul>
      </div>
    `;

    await sendEmail({
      to: financeUsers.map((user) => user.email),
      subject,
      text,
      html,
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
  const contractNumber = String(input.contractNumber || "").trim();
  const bankName = String(input.bankName || "").trim();
  const accountNumber = String(input.accountNumber || "").trim();

  console.log(
    `[accountConfirmation] Input: contractNumber=${contractNumber}, bankName=${bankName}, accountNumber=${accountNumber}`,
  );

  // Step 1: Validate required fields
  if (!contractNumber) {
    throw new Error("Enter your correct NMDS contract number");
  }
  if (!bankName || !accountNumber) {
    throw new Error("bankName and accountNumber are required");
  }

  // Step 2: Validate contractNumber exists in database
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

  // Find the account by contractNumber
  const accountByContract = await Account.findOne({
    institution: input.institutionId,
    contractNumber,
  });

  if (!accountByContract) {
    console.log(
      `[accountConfirmation] Account not found for contractNumber: ${contractNumber}`,
    );
    throw new Error("Enter your correct NMDS contract number");
  }

  // Step 3: Check if bank and account match
  const accountMatches =
    String(accountByContract.accountNumber || "").replace(/[^0-9]/g, "") ===
    String(accountNumber || "").replace(/[^0-9]/g, "");
  const bankMatches =
    String(accountByContract.bankName || "").toLowerCase() ===
    String(bankName || "").toLowerCase();

  if (!accountMatches || !bankMatches) {
    console.log(
      `[accountConfirmation] Mismatch detected. Account match: ${accountMatches}, Bank match: ${bankMatches}`,
    );

    const reasons: string[] = [];
    if (!accountMatches) reasons.push("accountNumberMismatch");
    if (!bankMatches) reasons.push("bankNameMismatch");

    // Create or update Issue for mismatches
    const existingIssue = await Issue.findOne({
      studentId: input.studentId,
    }).lean();

    const issuePayload = {
      contractNumber,
      studentId: input.studentId,
      bankName,
      accountNumber,
      reasons,
    };

    // Ensure contractNumber is always in the payload
    if (!issuePayload.contractNumber) {
      throw new Error(
        "[Critical] Cannot create/update Issue without contractNumber",
      );
    }

    if (existingIssue) {
      await Issue.findOneAndUpdate(
        { studentId: input.studentId },
        { $set: issuePayload },
        { new: true, runValidators: true },
      );
      await notifyFinanceUsersAboutIssue({
        institutionId: input.institutionId,
        studentId: input.studentId,
        studentEmail: input.studentEmail || student.email,
        contractNumber,
        bankName,
        accountNumber,
        reasons,
        notificationType: "updated",
      });
    } else {
      await Issue.create(issuePayload);
      await notifyFinanceUsersAboutIssue({
        institutionId: input.institutionId,
        studentId: input.studentId,
        studentEmail: input.studentEmail || student.email,
        contractNumber,
        bankName,
        accountNumber,
        reasons,
        notificationType: "created",
      });
    }

    throw new Error(
      "Account details do not match. Issue created for finance review",
    );
  }

  // Step 4: Account details match - confirm
  const confirmedBy = (accountByContract as any).confirmedBy;
  if (confirmedBy && String(confirmedBy) !== String(student._id)) {
    throw new Error("This account was already confirmed by another student");
  }

  const alreadyConfirmed =
    String(accountByContract.status || "").toLowerCase() === "confirmed" &&
    confirmedBy &&
    String(confirmedBy) === String(student._id);

  const confirmationDate = new Date();
  let shouldSave = false;

  if (!alreadyConfirmed) {
    accountByContract.status = "confirmed";
    (accountByContract as any).confirmedBy = student._id;
    (accountByContract as any).confirmationDate = confirmationDate;
    shouldSave = true;
  }

  if (typeof input.graduating === "boolean") {
    accountByContract.graduating = input.graduating;
    shouldSave = true;
  }

  if (shouldSave) {
    await accountByContract.save();
  }

  const result: AccountConfirmationResult = {
    accountId: accountByContract._id,
    confirmationDate:
      (accountByContract as any).confirmationDate || confirmationDate,
    status: accountByContract.status || "confirmed",
    alreadyConfirmed,
  };

  if (typeof accountByContract.graduating === "boolean") {
    result.graduating = accountByContract.graduating;
  }

  return result;
};
