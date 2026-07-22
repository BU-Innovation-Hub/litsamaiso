import { BranchCode } from "../models/BranchCode.js";
import { FinancialClearance } from "../models/FinancialClearance.js";
import type { Types } from "mongoose";

interface LookupResult {
  bankName: string;
  branchCode: string;
}

export const lookupBranchCode = async (
  bankName: string,
  institutionId: Types.ObjectId,
): Promise<LookupResult | null> => {
  const normalized = String(bankName || "").trim();
  if (!normalized) return null;

  // Step 1: Exact case-insensitive match
  let entry = await BranchCode.findOne({
    institution: institutionId,
    bankName: new RegExp(`^${escapeRegex(normalized)}$`, "i"),
  }).lean();

  if (entry) {
    return { bankName: entry.bankName, branchCode: entry.branchCode };
  }

  // Step 2: Fallback — partial/substring match
  // Try matching on the first word (most significant part of the bank name)
  const firstWord = normalized.split(/\s+/)[0];
  if (firstWord && firstWord.length >= 2) {
    entry = await BranchCode.findOne({
      institution: institutionId,
      bankName: new RegExp(escapeRegex(firstWord), "i"),
    }).lean();

    if (entry) {
      return { bankName: entry.bankName, branchCode: entry.branchCode };
    }
  }

  // Step 3: Broader substring match across the full bankName
  entry = await BranchCode.findOne({
    institution: institutionId,
    bankName: new RegExp(escapeRegex(normalized.substring(0, 6)), "i"),
  }).lean();

  if (entry) {
    return { bankName: entry.bankName, branchCode: entry.branchCode };
  }

  return null;
};

const escapeRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const getMissingBankNames = async (
  institutionId: string,
): Promise<string[]> => {
  const accountBanks = await FinancialClearance.distinct("bankName", {
    institution: institutionId,
    bankName: { $ne: "", $exists: true },
  });

  const existing = await BranchCode.find({ institution: institutionId })
    .select("bankName")
    .lean();

  const existingLower = new Set(
    existing.map((bc) => bc.bankName.toLowerCase().trim()),
  );

  const missing = accountBanks.filter((name) => {
    const trimmed = String(name || "").trim();
    return trimmed !== "" && !existingLower.has(trimmed.toLowerCase());
  });

  return missing.sort();
};

export const createMissingBranchCodes = async (
  institutionId: string,
  placeholderCode?: string,
): Promise<{ created: number; bankNames: string[] }> => {
  const missing = await getMissingBankNames(institutionId);
  const code = placeholderCode || "PENDING";
  const createdNames: string[] = [];

  for (const bankName of missing) {
    try {
      await BranchCode.create({
        bankName: bankName.trim(),
        branchCode: code,
        institution: institutionId,
      });
      createdNames.push(bankName);
    } catch (err: any) {
      if (err.code !== 11000) {
        console.warn(
          `[createMissingBranchCodes] Failed to create branch code for bankName=${bankName}:`,
          err.message || String(err),
        );
      }
    }
  }

  return { created: createdNames.length, bankNames: createdNames };
};
