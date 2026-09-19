import XLSX from "xlsx";
import { Buffer } from "buffer";
import { Student } from "../models/Student.js";
import type { Types } from "mongoose";
import { createStudentCapacityGuard } from "./billingService.js";

interface LoadResult {
  inserted: number;
  skipped: number;
  errors: string[];
  total: number;
}

const REQUIRED_COLUMNS = [
  "studentid",
  "email",
  "name",
  "surname",
  "studentstatus",
  "borrowernumber",
];

export interface StudentImportProgress {
  processed: number;
  total: number;
  inserted: number;
  skipped: number;
  errors: number;
  percent: number;
}

export const loadStudentsFromExcel = async (
  fileBuffer: Buffer,
  institutionId: Types.ObjectId,
  onProgress?: (progress: StudentImportProgress) => void,
): Promise<LoadResult> => {
  const workbook = XLSX.read(fileBuffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("Excel file contains no sheets");
  const sheet = workbook.Sheets[sheetName];
  if (!sheet)
    throw new Error("Unable to read the first sheet of the Excel file");
  const raw: any[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });

  // Normalize headers: map keys to lowercased names
  const rows = raw.map((row) => {
    const normalized: Record<string, any> = {};
    Object.keys(row).forEach((k) => {
      normalized[String(k).toLowerCase().trim()] = row[k];
    });
    return normalized;
  });

  // Verify required columns exist in first row
  const first = rows[0] || {};
  const missing = REQUIRED_COLUMNS.filter((c) => !(c in first));
  if (missing.length > 0) {
    throw new Error(`Missing required columns: ${missing.join(", ")}`);
  }

  let inserted = 0;
  let skipped = 0;
  const errors: string[] = [];
  const total = rows.length;
  const batchSize = 25;
  const capacity = await createStudentCapacityGuard(institutionId);

  const emitProgress = (processed: number) => {
    onProgress?.({
      processed,
      total,
      inserted,
      skipped,
      errors: errors.length,
      percent: total === 0 ? 100 : Math.round((processed / total) * 100),
    });
  };

  emitProgress(0);

  const VALUE_REQUIRED_COLUMNS = REQUIRED_COLUMNS.filter(
    (c) => c !== "borrowernumber",
  );

  for (const [idx, row] of rows.entries()) {
    try {
      // ensure all value-required fields have a value (borrowernumber is optional per-row)
      const hasAll = VALUE_REQUIRED_COLUMNS.every((c) => {
        const v = row[c];
        return v !== null && v !== undefined && String(v).trim() !== "";
      });
      if (!hasAll) {
        skipped += 1;
        continue;
      }

      const studentId = String(row["studentid"]).trim();
      const email = String(row["email"]).trim().toLowerCase();
      const name = String(row["name"]).trim();
      const surname = String(row["surname"]).trim();
      const borrowerNumberRaw = row["borrowernumber"];
      const borrowerNumber =
        borrowerNumberRaw !== null &&
        borrowerNumberRaw !== undefined &&
        String(borrowerNumberRaw).trim() !== ""
          ? String(borrowerNumberRaw).trim()
          : undefined;
      const studentStatusRaw = row["studentstatus"];
      const sval =
        studentStatusRaw === null || studentStatusRaw === undefined
          ? ""
          : String(studentStatusRaw).toLowerCase().trim();
      const studentStatus =
        studentStatusRaw === true ||
        sval === "true" ||
        sval === "1" ||
        sval === "active" ||
        sval === "yes";

      // skip duplicates by studentId or email within institution
      const exists = await Student.findOne({
        institution: institutionId,
        $or: [{ studentId }, { email }],
      }).lean();
      if (exists) {
        skipped += 1;
        continue;
      }

      const doc: Record<string, any> = {
        studentId,
        email,
        name,
        surname,
        studentStatus,
        institution: institutionId,
      };
      if (borrowerNumber) {
        doc.borrowerNumber = borrowerNumber;
      }
      if (!capacity.reserve()) {
        skipped += 1;
        continue;
      }
      try {
        await Student.create(doc);
      } catch (createError) {
        capacity.release();
        throw createError;
      }
      inserted += 1;
    } catch (err: any) {
      errors.push(`Row ${idx + 2}: ${err.message || String(err)}`);
    }

    const processed = idx + 1;
    if (processed % batchSize === 0 || processed === total) {
      emitProgress(processed);
    }
  }

  const capMessage = capacity.summary();
  if (capMessage) errors.push(capMessage);

  return { inserted, skipped, errors, total };
};
