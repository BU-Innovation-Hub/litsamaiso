import React from "react";
import { render } from "@react-email/render";
import type { Types } from "mongoose";
import { FinancialClearance } from "../models/FinancialClearance.js";
import { Role } from "../models/Role.js";
import { Student } from "../models/Student.js";
import { User } from "../models/User.js";
import { AdministrativeEmailJob } from "../models/AdministrativeEmailJob.js";
import type { AdministrativeEmailFailure } from "../models/AdministrativeEmailJob.js";
import AdministrativeEmail from "../emailTemplates/AdministrativeEmail.js";
import { getEmailBranding, sendEmail } from "../utils/email.js";

export type FinancialClearanceRecipientStatus = "pending" | "confirmed" | "paid";

export interface AdministrativeRecipientSelection {
  role: string;
  financialStatus?: FinancialClearanceRecipientStatus | undefined;
  batchNumber?: number | undefined;
}

export interface AdministrativeEmailDraft {
  subject: string;
  body: string;
}

type Recipient = {
  email: string;
};

const EMAIL_BATCH_SIZE = Math.max(
  1,
  Number.parseInt(process.env.ADMIN_EMAIL_BATCH_SIZE || "25", 10) || 25,
);
const EMAIL_CONCURRENCY = Math.max(
  1,
  Number.parseInt(process.env.ADMIN_EMAIL_CONCURRENCY || "3", 10) || 3,
);
const EMAIL_BATCH_DELAY_MS = Math.max(
  0,
  Number.parseInt(process.env.ADMIN_EMAIL_BATCH_DELAY_MS || "500", 10) || 500,
);

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const emailLooksValid = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const normalizeRoleForLookup = (role: string): string => {
  const normalized = String(role || "").trim().toLowerCase();
  if (normalized === "students" || normalized === "student") return "student";
  if (normalized === "appadmins" || normalized === "appadmin") return "appadmin";
  if (normalized === "institutionadmins" || normalized === "institutionadmin") {
    return "institutionadmin";
  }
  return normalized;
};

const displayRole = (role: string): string => {
  const normalized = normalizeRoleForLookup(role);
  if (normalized === "student") return "Student";
  if (normalized === "appadmin") return "AppAdmin";
  if (normalized === "institutionadmin") return "InstitutionAdmin";
  if (normalized === "finance") return "Finance";
  if (normalized === "saad") return "SAAD";
  return String(role || "").trim();
};

const dedupeRecipients = (emails: Array<string | undefined | null>): Recipient[] => {
  const seen = new Set<string>();
  const recipients: Recipient[] = [];

  for (const rawEmail of emails) {
    const email = String(rawEmail || "").trim().toLowerCase();
    if (!email || !emailLooksValid(email) || seen.has(email)) continue;
    seen.add(email);
    recipients.push({ email });
  }

  return recipients;
};

const buildFinancialClearanceFilter = (
  selection: AdministrativeRecipientSelection,
): Record<string, unknown> => {
  const filter: Record<string, unknown> = {};
  if (selection.financialStatus) {
    filter.status =
      selection.financialStatus === "pending"
        ? { $in: ["pending", "undefined", "", null] }
        : selection.financialStatus;
  }
  if (typeof selection.batchNumber === "number" && Number.isFinite(selection.batchNumber)) {
    filter.batchNumber = selection.batchNumber;
  }
  return filter;
};

const resolveStudentRecipients = async (
  selection: AdministrativeRecipientSelection,
): Promise<Recipient[]> => {
  const hasFinancialFilters =
    Boolean(selection.financialStatus) ||
    (typeof selection.batchNumber === "number" && Number.isFinite(selection.batchNumber));

  if (!hasFinancialFilters) {
    const students = await Student.find({}).select("email").lean();
    return dedupeRecipients(students.map((student) => student.email));
  }

  const accounts = await FinancialClearance.find(buildFinancialClearanceFilter(selection))
    .select("borrowerNumber confirmedBy institution")
    .lean();

  if (accounts.length === 0) return [];

  const borrowerNumbersByInstitution = new Map<string, Set<string>>();
  for (const account of accounts) {
    const institutionId = String(account.institution || "").trim();
    const borrowerNumber = String(account.borrowerNumber || "").trim();
    if (!institutionId || !borrowerNumber) continue;

    const existingSet = borrowerNumbersByInstitution.get(institutionId) || new Set<string>();
    existingSet.add(borrowerNumber);
    borrowerNumbersByInstitution.set(institutionId, existingSet);
  }

  const confirmedByIds = accounts
    .map((account) => account.confirmedBy)
    .filter((id): id is Types.ObjectId => Boolean(id));

  const or: Record<string, unknown>[] = [];
  for (const [institutionId, borrowerNumbers] of borrowerNumbersByInstitution.entries()) {
    or.push({
      institution: institutionId,
      borrowerNumber: { $in: Array.from(borrowerNumbers) },
    });
  }
  if (confirmedByIds.length > 0) {
    or.push({ _id: { $in: confirmedByIds } });
  }
  if (or.length === 0) return [];

  const students = await Student.find({ $or: or }).select("email").lean();
  return dedupeRecipients(students.map((student) => student.email));
};

export const resolveAdministrativeRecipients = async (
  selection: AdministrativeRecipientSelection,
): Promise<Recipient[]> => {
  const roleLookup = normalizeRoleForLookup(selection.role);
  if (!roleLookup) {
    throw new Error("Recipient role is required");
  }

  if (roleLookup === "student") {
    return resolveStudentRecipients(selection);
  }

  const role = await Role.findOne({ name: new RegExp(`^${roleLookup}$`, "i") })
    .select("_id name")
    .lean();
  if (!role) {
    throw new Error("Recipient role was not found");
  }

  const users = await User.find({ role: role._id }).select("email").lean();
  return dedupeRecipients(users.map((user) => user.email));
};

export const countAdministrativeRecipients = async (
  selection: AdministrativeRecipientSelection,
): Promise<number> => {
  const recipients = await resolveAdministrativeRecipients(selection);
  return recipients.length;
};

const renderAdministrativeEmail = async (draft: AdministrativeEmailDraft) => {
  const { appName, logoUrl, accentColor, attachments } = getEmailBranding();
  const html = await Promise.resolve(
    render(
      React.createElement(AdministrativeEmail, {
        subject: draft.subject,
        body: draft.body,
        appName,
        logoUrl,
        accentColor,
      }),
    ),
  );

  return { html, attachments };
};

const sendWithRetry = async (
  recipient: Recipient,
  draft: AdministrativeEmailDraft,
  rendered: Awaited<ReturnType<typeof renderAdministrativeEmail>>,
): Promise<AdministrativeEmailFailure | null> => {
  let lastError = "";

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      await sendEmail({
        to: recipient.email,
        subject: draft.subject,
        text: draft.body,
        html: rendered.html,
        attachments: rendered.attachments,
      });
      return null;
    } catch (error: any) {
      lastError = error?.message || String(error);
      if (attempt < 2) {
        await sleep(500);
      }
    }
  }

  return { email: recipient.email, error: lastError || "Email send failed" };
};

export const processAdministrativeEmailJob = async (jobId: Types.ObjectId | string) => {
  const job = await AdministrativeEmailJob.findById(jobId);
  if (!job) return;

  try {
    job.status = "processing";
    job.startedAt = new Date();
    await job.save();

    const recipients = await resolveAdministrativeRecipients(job.recipientSelection);
    const rendered = await renderAdministrativeEmail({
      subject: job.subject,
      body: job.body,
    });

    let successfulSends = 0;
    const failures: AdministrativeEmailFailure[] = [];

    for (let batchStart = 0; batchStart < recipients.length; batchStart += EMAIL_BATCH_SIZE) {
      const batch = recipients.slice(batchStart, batchStart + EMAIL_BATCH_SIZE);

      for (let start = 0; start < batch.length; start += EMAIL_CONCURRENCY) {
        const group = batch.slice(start, start + EMAIL_CONCURRENCY);
        const results = await Promise.all(
          group.map((recipient) =>
            sendWithRetry(
              recipient,
              { subject: job.subject, body: job.body },
              rendered,
            ),
          ),
        );

        for (const failure of results) {
          if (failure) {
            failures.push(failure);
          } else {
            successfulSends += 1;
          }
        }
      }

      await AdministrativeEmailJob.findByIdAndUpdate(job._id, {
        successfulSends,
        failedSends: failures.length,
        failures,
      });

      if (batchStart + EMAIL_BATCH_SIZE < recipients.length && EMAIL_BATCH_DELAY_MS > 0) {
        await sleep(EMAIL_BATCH_DELAY_MS);
      }
    }

    await AdministrativeEmailJob.findByIdAndUpdate(job._id, {
      status: "completed",
      totalRecipients: recipients.length,
      successfulSends,
      failedSends: failures.length,
      failures,
      completedAt: new Date(),
    });
  } catch (error: any) {
    await AdministrativeEmailJob.findByIdAndUpdate(job._id, {
      status: "failed",
      lastError: error?.message || String(error),
      completedAt: new Date(),
    });
  }
};

export const createAdministrativeEmailJob = async (input: {
  selection: AdministrativeRecipientSelection;
  draft: AdministrativeEmailDraft;
  requestedBy: Types.ObjectId;
}) => {
  const recipients = await resolveAdministrativeRecipients(input.selection);
  if (recipients.length === 0) {
    throw new Error("No matching recipients found");
  }

  const selection: AdministrativeRecipientSelection = {
    role: displayRole(input.selection.role),
  };
  if (input.selection.financialStatus) {
    selection.financialStatus = input.selection.financialStatus;
  }
  if (typeof input.selection.batchNumber === "number") {
    selection.batchNumber = input.selection.batchNumber;
  }

  const job = await AdministrativeEmailJob.create({
    status: "queued",
    recipientSelection: selection,
    subject: input.draft.subject,
    body: input.draft.body,
    totalRecipients: recipients.length,
    successfulSends: 0,
    failedSends: 0,
    failures: [],
    requestedBy: input.requestedBy,
  });

  setTimeout(() => {
    void processAdministrativeEmailJob(job._id);
  }, 0);

  return job;
};
