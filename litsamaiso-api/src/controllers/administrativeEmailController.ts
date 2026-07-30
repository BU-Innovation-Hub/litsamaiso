import type { Request, Response } from "express";
import { composeAdministrativeEmail } from "../services/geminiService.js";
import {
  countAdministrativeRecipients,
  createAdministrativeEmailJob,
  type AdministrativeRecipientSelection,
  type FinancialClearanceRecipientStatus,
} from "../services/administrativeEmailService.js";
import { AdministrativeEmailJob } from "../models/AdministrativeEmailJob.js";
import { recordAudit } from "../utils/auditLog.js";

const allowedFinancialStatuses = new Set(["pending", "confirmed", "paid"]);

const parseSelection = (source: Record<string, unknown>): AdministrativeRecipientSelection => {
  const role = String(source.role || "Student").trim();
  const financialStatusInput = String(
    source.financialStatus || source.status || "",
  )
    .trim()
    .toLowerCase();
  const batchInput = source.batchNumber ?? source.batch;
  const batchNumber =
    batchInput === undefined || batchInput === null || String(batchInput).trim() === ""
      ? undefined
      : Number(batchInput);

  const selection: AdministrativeRecipientSelection = { role };

  if (financialStatusInput) {
    if (!allowedFinancialStatuses.has(financialStatusInput)) {
      throw new Error("financialStatus must be pending, confirmed, or paid");
    }
    selection.financialStatus =
      financialStatusInput as FinancialClearanceRecipientStatus;
  }

  if (batchNumber !== undefined) {
    if (!Number.isInteger(batchNumber) || batchNumber <= 0) {
      throw new Error("batchNumber must be a positive number");
    }
    selection.batchNumber = batchNumber;
  }

  return selection;
};

export const countRecipients = async (req: Request, res: Response) => {
  try {
    const selection = parseSelection(req.query as Record<string, unknown>);
    const count = await countAdministrativeRecipients(selection);
    res.json({ count });
  } catch (error: any) {
    res.status(400).json({ message: error?.message || "Failed to count recipients" });
  }
};

export const generateEmail = async (req: Request, res: Response) => {
  try {
    const prompt = String(req.body?.prompt || "").trim();
    const tone = String(req.body?.tone || "").trim();

    if (!prompt || !tone) {
      res.status(400).json({ message: "Prompt and desired tone are required" });
      return;
    }

    const draft = await composeAdministrativeEmail({ prompt, tone });
    res.json({ draft });
  } catch (error: any) {
    console.error("[administrativeEmail.generate] Error:", error);
    res.status(500).json({ message: error?.message || "Failed to generate email" });
  }
};

export const sendEmailJob = async (req: Request, res: Response) => {
  try {
    const selection = parseSelection(req.body?.recipients || req.body || {});
    const subject = String(req.body?.subject || "").trim();
    const body = String(req.body?.body || "").trim();

    if (!subject || !body) {
      res.status(400).json({ message: "Subject and body are required" });
      return;
    }

    const user = (req as any).user;
    const job = await createAdministrativeEmailJob({
      selection,
      draft: { subject, body },
      requestedBy: user._id,
    });

    await recordAudit({
      action: "administrativeEmail.send.accepted",
      actorId: user._id?.toString(),
      actorEmail: user.email,
      actorRole: (user.role && (user.role as any).name) || undefined,
      targetCollection: "AdministrativeEmailJob",
      targetId: job._id?.toString(),
      details: {
        recipientSelection: job.recipientSelection,
        totalRecipients: job.totalRecipients,
      },
    });

    res.status(202).json({
      message: "Email send job accepted",
      job: {
        id: String(job._id),
        status: job.status,
        totalRecipients: job.totalRecipients,
        successfulSends: job.successfulSends,
        failedSends: job.failedSends,
      },
    });
  } catch (error: any) {
    console.error("[administrativeEmail.send] Error:", error);
    res.status(400).json({ message: error?.message || "Failed to accept email send job" });
  }
};

export const getEmailJob = async (req: Request, res: Response) => {
  try {
    const job = await AdministrativeEmailJob.findById(req.params.id).lean();
    if (!job) {
      res.status(404).json({ message: "Email job not found" });
      return;
    }

    res.json({
      job: {
        id: String(job._id),
        status: job.status,
        recipientSelection: job.recipientSelection,
        totalRecipients: job.totalRecipients,
        successfulSends: job.successfulSends,
        failedSends: job.failedSends,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        lastError: job.lastError,
      },
    });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to load email job" });
  }
};
