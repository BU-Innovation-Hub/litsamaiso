import { BranchCode } from "../models/BranchCode.js";
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
