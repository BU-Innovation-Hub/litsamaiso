import "dotenv/config";
import mongoose from "mongoose";
import { connectDatabase } from "../config/database.js";
import { AuditLog } from "../models/AuditLog.js";
import { FinancialClearance } from "../models/FinancialClearance.js";
import { RegistryImport } from "../models/RegistryImport.js";

const shouldDelete = process.argv.includes("--delete") && process.argv.includes("--confirm");

const run = async () => {
  await connectDatabase();
  const audits: any[] = await AuditLog.find({
    action: "registry.financial.created",
    targetCollection: "FinancialClearance",
  }).lean();
  const identified = new Map<string, { id: string; importId?: string; rowNumber?: number; reason: string }>();

  for (const audit of audits) {
    const details = audit.details || {};
    const importId = String(details.importId || "");
    const rowNumber = Number(details.rowNumber);
    if (audit.targetId && mongoose.isValidObjectId(audit.targetId)) {
      const record: any = await FinancialClearance.findById(audit.targetId).lean();
      if (record) identified.set(String(record._id), { id: String(record._id), importId, rowNumber, reason: "legacy Registry audit targetId" });
      continue;
    }
    if (!mongoose.isValidObjectId(importId) || !Number.isFinite(rowNumber)) continue;
    const imported: any = await RegistryImport.findById(importId).lean();
    const row = imported?.rows?.find((candidate: any) => Number(candidate.rowNumber) === rowNumber);
    if (!imported || !row) continue;
    const matches: any[] = await FinancialClearance.find({
      institution: imported.institution,
      nationalId: row.nationalId,
      borrowerNumber: row.borrowerNumber,
      accountNumber: row.accountNumber,
    }).lean();
    if (matches.length === 1) identified.set(String(matches[0]._id), { id: String(matches[0]._id), importId, rowNumber, reason: "legacy Registry importId/rowNumber evidence" });
  }

  const records = [...identified.values()];
  console.log(JSON.stringify({ dryRun: !shouldDelete, identified: records.length, records }, null, 2));
  if (shouldDelete && records.length) {
    const result = await FinancialClearance.deleteMany({ _id: { $in: records.map((record) => record.id) } });
    await AuditLog.create({
      action: "registry.legacy_financial_cleanup",
      targetCollection: "FinancialClearance",
      details: {
        deletedCount: result.deletedCount,
        records,
      },
    });
    console.log(JSON.stringify({ deletedCount: result.deletedCount }));
  }
  await mongoose.disconnect();
};

run().catch(async (error) => { console.error(error); await mongoose.disconnect(); process.exitCode = 1; });
