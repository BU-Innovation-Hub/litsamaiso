import XLSX from "xlsx";
import { RegistryImport, type RegistryClassification, type RegistryImportKind } from "../models/RegistryImport.js";
import { Student } from "../models/Student.js";
import { User } from "../models/User.js";
import { RegistryFinancialClearance } from "../models/RegistryFinancialClearance.js";
import { recordAudit } from "../utils/auditLog.js";
import { assignBorrowerNumber, BorrowerAssignmentError } from "./borrowerAssignmentService.js";

type RegistryRow = Record<string, any>;
type Actor = { _id: unknown; email?: string; role?: any; institution: unknown };

const normalizeHeader = (value: unknown): string => String(value ?? "").toLowerCase().replace(/[\s_-]+/g, "").replace(/[^a-z0-9]/g, "");
const value = (row: RegistryRow, aliases: string[]): string => {
  const key = Object.keys(row).find((candidate) => aliases.includes(normalizeHeader(candidate)));
  return key ? String(row[key] ?? "").trim() : "";
};
const asBoolean = (input: string): boolean => ["true", "1", "yes", "y", "active", "registered"].includes(input.toLowerCase());
const validStatus = (input: string): boolean => ["true", "false", "1", "0", "yes", "no", "y", "n", "active", "inactive", "registered", "unregistered"].includes(input.toLowerCase());
const roleName = (actor: Actor): string => String((actor.role && actor.role.name) || actor.role || "");
const id = (input: unknown): string => String(input);
export const normalizeNationalId = (input: unknown): string => String(input ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");

const requiredHeaders: Record<RegistryImportKind, string[][]> = {
  students: [["name"], ["surname"], ["email"], ["nationalid", "national id", "personalid", "personal id"].map(normalizeHeader), ["studentid"].map(normalizeHeader), ["studentstatus"], ["borrowernumber", "borrower number", "borrowers number"].map(normalizeHeader)],
  financial: [["fullnames", "fullname", "full names"].map(normalizeHeader), ["nationalid", "national id", "personalid", "students personal id", "student personal id", "studentid"].map(normalizeHeader), ["borrowernumber", "borrower number", "borrowers number"].map(normalizeHeader), ["courseofstudy", "course of study"].map(normalizeHeader), ["bankname", "bank name"].map(normalizeHeader), ["accountnumber", "account number"].map(normalizeHeader)],
};

const aliases: Record<RegistryImportKind, Record<string, string[]>> = {
  students: {
    name: ["name"], surname: ["surname"], email: ["email", "emailaddress"], nationalId: ["personalid", "idnumber", "nationalid", "identitynumber", "students personal id", "student personal id"].map(normalizeHeader), studentId: ["studentid"].map(normalizeHeader), studentStatus: ["studentstatus"], borrowerNumber: ["borrowernumber", "borrower number", "borrowers number"].map(normalizeHeader),
  },
  financial: {
    fullnames: ["fullnames", "fullname", "full names"].map(normalizeHeader), nationalId: ["personalid", "idnumber", "nationalid", "identitynumber", "students personal id", "student personal id", "studentid"].map(normalizeHeader), borrowerNumber: ["borrowernumber", "borrower number", "borrowers number"].map(normalizeHeader), courseOfStudy: ["courseofstudy", "course of study"].map(normalizeHeader), bankName: ["bankname", "bank name"].map(normalizeHeader), accountNumber: ["accountnumber", "account number"].map(normalizeHeader), batchNumber: ["batchnumber", "batch number"].map(normalizeHeader), graduating: ["graduating"], status: ["status"],
  },
};

const classify = (rows: RegistryRow[], kind: RegistryImportKind): RegistryRow[] => {
  const seen = new Map<string, number>();
  for (const row of rows) {
    const key = kind === "students" ? `${row.studentId.toLowerCase()}|${row.email.toLowerCase()}` : `${row.borrowerNumber}|${row.accountNumber}`;
    if (row.classification !== "conflict") {
      row.classification = seen.has(key) ? "duplicate" : "missing/unmatched";
      row.reasons = seen.has(key) ? ["Duplicate row in upload"] : [];
    }
    seen.set(key, (seen.get(key) || 0) + 1);
  }
  return rows;
};

const summarize = (rows: RegistryRow[]): Record<string, number> => rows.reduce((result, row) => {
  result[row.classification] = (result[row.classification] || 0) + 1;
  result.total = (result.total || 0) + 1;
  return result;
}, {} as Record<string, number>);

export type RegistryUploadProgress = { processed: number; total: number; inserted: number; skipped: number; errors: number; percent: number; message: string };
export type RegistryProgressCallback = (progress: RegistryUploadProgress) => void;

export const stageRegistryUpload = async (input: { buffer: Buffer; filename: string; kind: RegistryImportKind; actor: Actor; onProgress?: RegistryProgressCallback }) => {
  const workbook = XLSX.read(input.buffer, { type: "buffer", cellDates: false });
  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) throw new Error("Spreadsheet has no worksheet");
  const source = XLSX.utils.sheet_to_json<RegistryRow>(workbook.Sheets[firstSheet]!, { defval: "", blankrows: true });
  if (!source.length) throw new Error("Spreadsheet has no data rows");
  const headers = Object.keys(source[0] || {}).map(normalizeHeader);
  const missing = requiredHeaders[input.kind].filter((group) => !group.some((header) => headers.includes(normalizeHeader(header))));
  if (missing.length) throw new Error(`Missing required columns: ${missing.map((group) => group[0]).join(", ")}`);

  const rows = source.map((raw, index) => {
    const a = aliases[input.kind];
    const row: RegistryRow = { rowNumber: index + 2, source: raw, classification: "missing/unmatched", reasons: [], resolution: null, outcome: "pending", exceptionStatus: null, failure: null };
      if (input.kind === "students") { const nationalId = normalizeNationalId(value(raw, a.nationalId || [])); Object.assign(row, { name: value(raw, a.name || []), surname: value(raw, a.surname || []), email: value(raw, a.email || []).toLowerCase(), nationalId, studentId: value(raw, a.studentId || []), studentStatus: asBoolean(value(raw, a.studentStatus || [])), borrowerNumber: value(raw, a.borrowerNumber || []) }); }
     else Object.assign(row, { fullnames: value(raw, a.fullnames || []), nationalId: normalizeNationalId(value(raw, a.nationalId || [])), borrowerNumber: value(raw, a.borrowerNumber || []), courseOfStudy: value(raw, a.courseOfStudy || []), bankName: value(raw, a.bankName || []), accountNumber: value(raw, a.accountNumber || []), batchNumber: Number(value(raw, a.batchNumber || [])) || 0, graduating: asBoolean(value(raw, a.graduating || [])), status: value(raw, a.status || []) || "pending" });
     const required = input.kind === "students" ? [row.name, row.surname, row.email, row.studentId, row.nationalId, value(raw, a.studentStatus || [])] : [row.fullnames, row.nationalId, row.borrowerNumber, row.courseOfStudy, row.bankName, row.accountNumber];
    if (required.some((item) => !String(item).trim())) { row.classification = "conflict"; row.reasons = ["One or more required values are blank"]; }
    else if (input.kind === "students" && !validStatus(value(raw, a.studentStatus || []))) { row.classification = "conflict"; row.reasons = ["studentStatus must be a recognized boolean/status value"]; }
      input.onProgress?.({ processed: index + 1, total: source.length, inserted: 0, skipped: 0, errors: 0, percent: Math.round(((index + 1) / source.length) * 20), message: "Validating Registry records" });
     return row;
  });
  classify(rows, input.kind);
  const imported: any = await RegistryImport.create({ institution: input.actor.institution as any, uploadedBy: input.actor._id as any, kind: input.kind, filename: input.filename, rows, summary: summarize(rows), totalRows: rows.length, processingStatus: "staged" });
  await reconcileRegistryImport(imported._id.toString(), input.actor);
  input.onProgress?.({ processed: 0, total: rows.length, inserted: 0, skipped: 0, errors: 0, percent: 25, message: "Registry records staged; starting database processing" });
  await recordAudit({ action: "registry.upload.staged", actorId: id(input.actor._id), ...(input.actor.email ? { actorEmail: input.actor.email } : {}), actorRole: roleName(input.actor), targetCollection: "RegistryImport", targetId: imported._id.toString(), details: { kind: input.kind, filename: input.filename, rows: rows.length } });
  return RegistryImport.findById(imported._id).lean();
};

export const reconcileRegistryImport = async (importId: string, actor: Actor) => {
  const imported: any = await (RegistryImport as any).findOne({ _id: importId, institution: actor.institution as any });
  if (!imported) throw new Error("Registry import not found");
  const rows: RegistryRow[] = imported.rows as RegistryRow[];
  if (imported.kind === "students") {
    const students: any[] = await (Student as any).find({ institution: actor.institution as any }).lean();
    for (const row of rows) {
      if (row.classification === "duplicate" || row.classification === "conflict") continue;
        const byNationalId = row.nationalId && students.find((student) => Boolean(student.nationalId) && normalizeNationalId(student.nationalId) === row.nationalId);
       const byId = students.find((student) => student.studentId.toLowerCase() === row.studentId.toLowerCase());
       const byEmail = students.find((student) => student.email.toLowerCase() === row.email.toLowerCase());
       if (byNationalId && ((byId && id(byNationalId._id) !== id(byId._id)) || (byEmail && id(byNationalId._id) !== id(byEmail._id)))) { row.classification = "conflict"; row.reasons = ["National ID conflicts with another student identifier"]; continue; }
       if (byId && byEmail && id(byId._id) !== id(byEmail._id)) { row.classification = "conflict"; row.reasons = ["Student ID and email identify different students"]; continue; }
       const match = byNationalId || byId || byEmail;
      if (!match) { row.classification = "missing/unmatched"; row.reasons = ["No existing student matches student ID or email"]; continue; }
      row.targetStudentId = id(match._id);
      const borrowerOwner = row.borrowerNumber ? students.find((student) => student.borrowerNumber === row.borrowerNumber) : undefined;
      if (borrowerOwner && id(borrowerOwner._id) !== id(match._id)) { row.classification = "conflict"; row.reasons = ["Borrower number belongs to a different student"]; }
      else if (match.borrowerNumber && row.borrowerNumber && match.borrowerNumber !== row.borrowerNumber) { row.classification = "conflict"; row.reasons = ["Existing borrower number differs; explicit exception required"]; }
      else if (row.borrowerNumber && !match.borrowerNumber) { row.classification = "possible/review"; row.reasons = ["Borrower number assignment requires explicit approval"]; }
      else row.classification = "matched";
    }
  } else {
    const students: any[] = await (Student as any).find({ institution: actor.institution as any }).lean();
    for (const row of rows) {
      if (row.classification === "duplicate" || row.classification === "conflict") continue;
       const byNationalId = row.nationalId && students.find((student) => Boolean(student.nationalId) && normalizeNationalId(student.nationalId) === row.nationalId);
        const matches = byNationalId ? [byNationalId] : [];
      const borrowerOwner = students.find((student) => student.borrowerNumber === row.borrowerNumber);
      if (borrowerOwner && matches.length && id(borrowerOwner._id) !== id(matches[0]._id)) { row.classification = "conflict"; row.reasons = ["Borrower number belongs to a different student"]; }
       else if (matches.length === 1) {
        row.targetStudentId = id(matches[0]._id);
        if (matches[0].borrowerNumber && matches[0].borrowerNumber !== row.borrowerNumber) { row.classification = "conflict"; row.reasons = ["Existing borrower number differs; explicit exception required"]; }
          else { row.classification = "matched"; row.reasons = ["Exact normalized National ID match"]; }
       } else if (!row.nationalId) { row.classification = "conflict"; row.reasons = ["Financial Clearance row has no Student's National ID"]; }
       else { row.classification = "missing/unmatched"; row.reasons = ["Student's National ID does not exist in Registered Students"]; }
    }
  }
  imported.summary = summarize(rows); imported.markModified("rows"); imported.markModified("summary"); await imported.save();
  return imported.toObject();
};

export const resolveRegistryRow = async (importId: string, rowNumber: number, resolution: RegistryRow, actor: Actor) => {
  const imported: any = await (RegistryImport as any).findOne({ _id: importId, institution: actor.institution as any });
  if (!imported) throw new Error("Registry import not found");
  const row = (imported.rows as RegistryRow[]).find((candidate) => candidate.rowNumber === rowNumber);
  if (!row) throw new Error("Registry row not found");
  if (imported.kind !== "students" || resolution.action !== "assignBorrower" || !resolution.targetStudentId) throw new Error("Only an explicit student borrower assignment can be resolved");
  const target: any = await (Student as any).findOne({ _id: resolution.targetStudentId, institution: actor.institution as any });
  if (!target) throw new Error("Target student not found in your institution");
  if (target.borrowerNumber && target.borrowerNumber !== row.borrowerNumber) throw new Error("Target student already has a different borrower number");
  row.resolution = { action: "assignBorrower", targetStudentId: id(target._id), approvedBy: id(actor._id), approvedAt: new Date().toISOString() };
  row.targetStudentId = id(target._id); row.classification = "matched"; row.reasons = ["Explicit borrower assignment approved; pending apply"];
  imported.summary = summarize(imported.rows); imported.markModified("rows"); imported.markModified("summary"); await imported.save();
  await recordAudit({ action: "registry.exception.resolved", actorId: id(actor._id), ...(actor.email ? { actorEmail: actor.email } : {}), actorRole: roleName(actor), targetCollection: "RegistryImport", targetId: importId, details: { rowNumber, resolution: row.resolution } });
  return imported.toObject();
};

const terminalOutcome = (row: RegistryRow, outcome: "inserted" | "updated" | "skipped" | "error", reason?: string, error?: unknown) => {
  row.outcome = outcome;
  row.processedAt = new Date().toISOString();
  if (outcome === "skipped" || outcome === "error") {
    row.exceptionStatus = "open";
    row.reasons = [reason || "Row could not be processed"];
    const failure = { reason: reason || "Row could not be processed", error: error instanceof Error ? error.message : String(error || reason || "Unknown error"), at: row.processedAt };
    row.failureHistory = [...(Array.isArray(row.failureHistory) ? row.failureHistory : []), failure];
    row.failure = failure;
  } else {
    row.exceptionStatus = null;
    row.failure = null;
  }
  return { rowNumber: row.rowNumber, reason };
};

const processRegistryRow = async (imported: any, row: RegistryRow, actor: Actor) => {
  if (["inserted", "updated", "skipped", "error"].includes(String(row.outcome))) return row.outcome;
  if (row.classification === "conflict" || row.classification === "duplicate") {
    terminalOutcome(row, "skipped", row.reasons?.join("; ") || (row.classification === "duplicate" ? "Duplicate row in upload" : "Conflict requires review"));
    return "skipped";
  }

  if (imported.kind === "students") {
    const existing: any = await Student.findOne({ institution: actor.institution as any, $or: [{ studentId: row.studentId }, { email: row.email }, ...(row.nationalId ? [{ nationalId: row.nationalId }] : [])] });
    if (existing) {
      let changed = false;
      if (row.nationalId) {
        const currentNationalId = normalizeNationalId(existing.nationalId || "");
        if (!currentNationalId) {
          try {
            const update = await Student.updateOne({ _id: existing._id, institution: actor.institution as any, $or: [{ nationalId: { $exists: false } }, { nationalId: null }, { nationalId: "" }] }, { $set: { nationalId: row.nationalId } });
            if (update.modifiedCount === 1) changed = true;
          } catch (error: any) {
            if (String(error?.code) === "11000" || /duplicate/i.test(String(error?.message || ""))) {
              terminalOutcome(row, "error", "National ID belongs to another student", error);
              return "error";
            }
            throw error;
          }
        } else if (currentNationalId !== normalizeNationalId(row.nationalId)) {
          terminalOutcome(row, "error", "Existing National ID differs; explicit correction required");
          return "error";
        }
      }
      if (row.borrowerNumber && !existing.borrowerNumber && row.resolution?.action === "assignBorrower") {
        try { await assignBorrowerNumber({ institution: actor.institution, studentId: id(existing._id), borrowerNumber: row.borrowerNumber, actor, details: { importId: id(imported._id), rowNumber: row.rowNumber } }); changed = true; }
        catch (error) { terminalOutcome(row, "error", error instanceof BorrowerAssignmentError ? error.message : "Borrower number assignment was not applied", error); return "error"; }
      }
      const sameRecord = String(existing.studentId || "").toLowerCase() === String(row.studentId || "").toLowerCase()
        && String(existing.email || "").toLowerCase() === String(row.email || "").toLowerCase()
        && (!row.nationalId || normalizeNationalId(existing.nationalId || "") === normalizeNationalId(row.nationalId))
        && (!row.borrowerNumber || String(existing.borrowerNumber || "") === String(row.borrowerNumber));
      terminalOutcome(row, changed || sameRecord ? "updated" : "skipped", changed || sameRecord ? undefined : "Student already exists; no approved change");
      return changed || sameRecord ? "updated" : "skipped";
    }
    const owner: any = row.borrowerNumber ? await Student.findOne({ institution: actor.institution as any, borrowerNumber: row.borrowerNumber }) : null;
    if (owner) { terminalOutcome(row, "error", "Borrower number belongs to another student"); return "error"; }
    let createdStudent: any;
    try {
      createdStudent = await Student.create({ institution: actor.institution as any, studentId: row.studentId, email: row.email, name: row.name, surname: row.surname, studentStatus: row.studentStatus, ...(row.nationalId ? { nationalId: row.nationalId } : {}) });
      if (row.borrowerNumber) await assignBorrowerNumber({ institution: actor.institution, studentId: id(createdStudent._id), borrowerNumber: row.borrowerNumber, actor, details: { importId: id(imported._id), rowNumber: row.rowNumber } });
    } catch (error: any) {
      if (createdStudent?._id) await Student.deleteOne({ _id: createdStudent._id, institution: actor.institution as any, borrowerNumber: { $in: [null, ""] } });
      if (String(error?.code) === "11000") { terminalOutcome(row, "error", "Student identifier already exists or conflicts with another student", error); return "error"; }
      terminalOutcome(row, "error", error instanceof BorrowerAssignmentError ? error.message : "Student could not be created", error);
      return "error";
    }
    await recordAudit({ ...registryActor(actor), action: "registry.student.created", targetCollection: "Student", targetId: id(createdStudent._id), details: { importId: id(imported._id), rowNumber: row.rowNumber, studentId: row.studentId, nationalId: row.nationalId } });
    terminalOutcome(row, "inserted");
    return "inserted";
  }

  const targetId = row.resolution?.action === "assignBorrower" ? row.resolution.targetStudentId : row.classification === "matched" ? row.targetStudentId : undefined;
  if (!targetId || !row.borrowerNumber) {
    const reason = row.reasons?.join("; ") || (!row.borrowerNumber ? "Row has no borrower number" : `Student's National ID (${row.nationalId || "missing"}) does not exist in Registered Students`);
    terminalOutcome(row, "skipped", reason);
    return "skipped";
  }
  const student: any = await Student.findOne({ _id: targetId, institution: actor.institution as any });
  if (!student) { terminalOutcome(row, "error", "Target student no longer exists"); return "error"; }
  try {
    await assignBorrowerNumber({ institution: actor.institution, studentId: id(student._id), borrowerNumber: row.borrowerNumber, actor, details: { importId: id(imported._id), rowNumber: row.rowNumber } });
    const existingClearance: any = await RegistryFinancialClearance.findOne({ institution: actor.institution as any, $or: [{ borrowerNumber: row.borrowerNumber }, { accountNumber: row.accountNumber }] });
    if (!existingClearance) await RegistryFinancialClearance.create({ institution: actor.institution as any, student: student._id, registryImport: imported._id, rowNumber: row.rowNumber, nationalId: row.nationalId, borrowerNumber: row.borrowerNumber, accountNumber: row.accountNumber, bankName: row.bankName, batchNumber: row.batchNumber || 0, courseOfStudy: row.courseOfStudy, fullnames: row.fullnames, graduating: Boolean(row.graduating), status: row.status || "pending" });
    terminalOutcome(row, "inserted");
    return "inserted";
  } catch (error: any) {
    if (String(error?.code) === "11000") {
      const duplicate = await RegistryFinancialClearance.findOne({ institution: actor.institution as any, $or: [{ registryImport: imported._id, rowNumber: row.rowNumber }, { borrowerNumber: row.borrowerNumber }, { accountNumber: row.accountNumber }] });
      if (duplicate) { terminalOutcome(row, "updated"); return "updated"; }
    }
    terminalOutcome(row, "error", error instanceof BorrowerAssignmentError ? error.message : "Financial clearance could not be persisted", error);
    return "error";
  }
};

export type RegistryApplyProgress = RegistryUploadProgress & { type?: "progress" | "completed" | "error" };

export const applyRegistryImport = async (importId: string, actor: Actor, onProgress?: RegistryProgressCallback) => {
  const now = new Date();
  const stale = new Date(now.getTime() - 10 * 60 * 1000);
  const imported: any = await (RegistryImport as any).findOneAndUpdate(
    { _id: importId, institution: actor.institution as any, status: { $ne: "applied" }, $or: [{ processingStatus: { $in: ["staged", "failed", null] } }, { processingStatus: "processing", processingAt: { $lt: stale } }] },
    { $set: { processingStatus: "processing", processingAt: now }, $setOnInsert: { totalRows: 0 } },
    { new: true },
  );
  if (!imported) {
    const current: any = await RegistryImport.findOne({ _id: importId, institution: actor.institution as any });
    if (!current) throw new Error("Registry import not found");
    if (current.processingStatus === "completed" || current.status === "applied") return { importId, applied: Number(current.inserted || 0) + Number(current.updated || 0), inserted: Number(current.inserted || 0), updated: Number(current.updated || 0), skipped: Number(current.skipped || 0), errors: Number(current.errors || 0), processed: Number(current.processed || 0), total: Number(current.totalRows || current.rows?.length || 0), status: "completed" };
    throw new Error("Registry import is already being processed");
  }
  const rows: RegistryRow[] = imported.rows || [];
  imported.totalRows = rows.length;
  imported.processed = Number(imported.processed || 0);
  imported.inserted = Number(imported.inserted || 0);
  imported.updated = Number(imported.updated || 0);
  imported.skipped = Number(imported.skipped || 0);
  imported.errors = Number(imported.errors || 0);
  const emit = (message: string) => onProgress?.({ processed: imported.processed, total: rows.length, inserted: imported.inserted, skipped: imported.skipped, errors: imported.errors, percent: rows.length ? Math.floor(25 + (imported.processed / rows.length) * 75) : 100, message });
  try {
    emit("Processing Registry records");
    for (const row of rows) {
      if (["inserted", "updated", "skipped", "error"].includes(String(row.outcome))) continue;
      let result: string;
      try {
        result = await processRegistryRow(imported, row, actor);
      } catch (error) {
        terminalOutcome(row, "error", "Unexpected row processing failure", error);
        result = "error";
      }
      imported.processed += 1;
      if (result === "inserted") imported.inserted += 1;
      else if (result === "updated") imported.updated += 1;
      else if (result === "skipped") imported.skipped += 1;
      else imported.errors += 1;
      imported.summary = summarize(rows);
      imported.markModified("rows");
      await imported.save();
      emit("Processing Registry records");
    }
    imported.status = "applied";
    imported.processingStatus = "completed";
    imported.completedAt = new Date();
    imported.processed = rows.length;
    await imported.save();
    const result = { importId, applied: imported.inserted + imported.updated, inserted: imported.inserted, updated: imported.updated, skipped: imported.skipped, errors: imported.errors, processed: imported.processed, total: rows.length, status: "completed" as const };
    onProgress?.({ ...result, percent: 100, message: "Import completed" });
    await recordAudit({ action: "registry.assignments.applied", actorId: id(actor._id), ...(actor.email ? { actorEmail: actor.email } : {}), actorRole: roleName(actor), targetCollection: "RegistryImport", targetId: importId, details: result });
    return result;
  } catch (error: any) {
    imported.processingStatus = "failed";
    imported.lastError = error?.message || String(error);
    await imported.save();
    onProgress?.({ processed: imported.processed, total: rows.length, inserted: imported.inserted, skipped: imported.skipped, errors: imported.errors, percent: rows.length ? Math.floor(25 + (imported.processed / rows.length) * 75) : 0, message: imported.lastError });
    throw error;
  }
};

export const getRegistryDashboard = async (actor: Actor) => {
  const imports: any[] = await (RegistryImport as any).find({ institution: actor.institution as any }).sort({ createdAt: -1 }).limit(10).lean();
  const latest = imports[0] || null;
  const latestFinancial: any = await (RegistryImport as any).findOne({ institution: actor.institution as any, kind: "financial" }).sort({ createdAt: -1 }).lean();
  const [totalRegisteredStudents, assigned] = await Promise.all([
    (Student as any).countDocuments({ institution: actor.institution as any }),
    (Student as any).countDocuments({ institution: actor.institution as any, borrowerNumber: { $exists: true, $nin: ["", null] } }),
  ]);
  const financialRows = Array.isArray(latestFinancial?.rows) ? latestFinancial.rows : [];
  const stats = {
    totalRegistered: totalRegisteredStudents,
    assigned,
    missing: totalRegisteredStudents - assigned,
    conflicts: financialRows.filter((row: any) => row.classification !== "matched").length,
  };
  return { stats, latestReconciliation: latest ? { importId: latest._id, kind: latest.kind, filename: latest.filename, status: latest.status, createdAt: latest.createdAt, summary: latest.summary } : null, recentImports: imports };
};

const registryActor = (actor: Actor) => ({ actorId: id(actor._id), ...(actor.email ? { actorEmail: actor.email } : {}), actorRole: roleName(actor) });
const duplicateStudent = async (institution: unknown, input: Record<string, any>, excludeId?: string) => {
  const checks: Array<Record<string, any>> = [{ studentId: input.studentId }, { email: String(input.email || "").toLowerCase() }];
  if (input.nationalId) checks.push({ nationalId: normalizeNationalId(input.nationalId) });
  if (input.borrowerNumber) checks.push({ borrowerNumber: String(input.borrowerNumber).trim() });
  const query: any = { institution, $or: checks.filter((item) => Object.values(item)[0]) };
  if (excludeId) query._id = { $ne: excludeId };
  return (Student as any).findOne(query).lean();
};

export const listRegistryStudents = async (actor: Actor, options: { search?: string; status?: string; borrower?: string; page?: number; limit?: number }) => {
  const page = Math.max(1, Number(options.page) || 1); const limit = Math.min(100, Math.max(1, Number(options.limit) || 25));
  const query: any = { institution: actor.institution as any };
  if (options.search?.trim()) { const search = options.search.trim(); query.$or = [{ name: { $regex: search, $options: "i" } }, { surname: { $regex: search, $options: "i" } }, { email: { $regex: search, $options: "i" } }, { studentId: { $regex: search, $options: "i" } }, { nationalId: { $regex: search, $options: "i" } }, { borrowerNumber: { $regex: search, $options: "i" } }]; }
  if (options.status !== undefined && options.status !== "") query.studentStatus = ["true", "1", "active", "registered"].includes(String(options.status).toLowerCase());
  if (options.borrower === "assigned") query.borrowerNumber = { $exists: true, $nin: ["", null] };
  if (options.borrower === "missing") query.$and = [...(query.$and || []), { $or: [{ borrowerNumber: { $exists: false } }, { borrowerNumber: "" }, { borrowerNumber: null }] }];
  const [items, total] = await Promise.all([(Student as any).find(query).sort({ surname: 1, name: 1 }).skip((page - 1) * limit).limit(limit).lean(), (Student as any).countDocuments(query)]);
  return { items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
};

export const addRegistryStudent = async (actor: Actor, input: Record<string, any>) => {
  const borrowerNumber = String(input.borrowerNumber || "").trim();
  const student = { studentId: String(input.studentId || "").trim(), email: String(input.email || "").trim().toLowerCase(), name: String(input.name || "").trim(), surname: String(input.surname || "").trim(), studentStatus: Boolean(input.studentStatus), ...(input.nationalId ? { nationalId: normalizeNationalId(input.nationalId) } : {}), ...(borrowerNumber ? { borrowerNumber } : {}) };
  if (!student.studentId || !student.email || !student.name || !student.surname) throw new Error("studentId, email, name and surname are required");
  if (await duplicateStudent(actor.institution, student)) throw new Error("A student with the same student ID, email, National ID, or borrower number already exists");
  const created: any = await (Student as any).create({ ...student, institution: actor.institution as any });
  if (borrowerNumber) {
    try {
      await assignBorrowerNumber({ institution: actor.institution, studentId: id(created._id), borrowerNumber, actor, details: { source: "manual_registry_student" } });
    } catch (error) {
      await (Student as any).deleteOne({ _id: created._id, institution: actor.institution as any });
      throw error;
    }
  }
  await recordAudit({ ...registryActor(actor), action: "registry.student.created", targetCollection: "Student", targetId: id(created._id), details: { student: { ...student, ...(borrowerNumber ? { borrowerNumber } : {}) } } });
  return created.toObject();
};

export const editRegistryStudent = async (actor: Actor, studentId: string, input: Record<string, any>) => {
  const student: any = await (Student as any).findOne({ _id: studentId, institution: actor.institution as any });
  if (!student) throw new Error("Student not found");
  const update: any = {};
  for (const key of ["studentId", "name", "surname"]) if (input[key] !== undefined) update[key] = String(input[key]).trim();
  if (input.email !== undefined) update.email = String(input.email).trim().toLowerCase();
  if (input.studentStatus !== undefined) update.studentStatus = Boolean(input.studentStatus);
  if (input.nationalId !== undefined) update.nationalId = normalizeNationalId(input.nationalId);
  const requestedBorrowerNumber = input.borrowerNumber === undefined ? undefined : String(input.borrowerNumber).trim();
  if (requestedBorrowerNumber === "") update.borrowerNumber = "";
  if (requestedBorrowerNumber && requestedBorrowerNumber !== String(student.borrowerNumber || "").trim()) {
    update.borrowerNumber = requestedBorrowerNumber;
  }
  if (await duplicateStudent(actor.institution, update, studentId)) throw new Error("A student with the same student ID, email, National ID, or borrower number already exists");
  const oldBorrowerNumber = String(student.borrowerNumber || "").trim();
  const borrowerChanged = Boolean(requestedBorrowerNumber !== undefined && requestedBorrowerNumber !== oldBorrowerNumber);
  if (borrowerChanged) delete update.borrowerNumber;
  Object.assign(student, update); await student.save();
  if (borrowerChanged) {
    if (requestedBorrowerNumber) {
      await assignBorrowerNumber({ institution: actor.institution, studentId, borrowerNumber: requestedBorrowerNumber, actor, details: { source: "manual_registry_edit", previous: oldBorrowerNumber || null } });
    } else {
      const syncUser: any = await User.findOne({ institution: actor.institution as any, studentId: student.studentId }).populate("role", "name");
      const role = String(syncUser?.role?.name || syncUser?.role || "").toLowerCase();
      if (syncUser && (!role || role === "student")) {
        await (User as any).updateOne({ _id: syncUser._id, institution: actor.institution as any, studentId: student.studentId, borrowerNumber: { $nin: [null, ""] } }, { $unset: { borrowerNumber: 1 } });
        await recordAudit({ ...registryActor(actor), action: "registry.borrower.cleared", targetCollection: "User", targetId: id(syncUser._id), details: { studentId: student.studentId, previous: oldBorrowerNumber || null } });
      }
    }
  }
  await recordAudit({ ...registryActor(actor), action: "registry.student.updated", targetCollection: "Student", targetId: studentId, details: { changes: update } });
  return student.toObject();
};

export const deleteRegistryStudent = async (actor: Actor, studentId: string) => {
  const student: any = await (Student as any).findOneAndDelete({ _id: studentId, institution: actor.institution as any });
  if (!student) throw new Error("Student not found");
  await recordAudit({ ...registryActor(actor), action: "registry.student.deleted", targetCollection: "Student", targetId: studentId, details: { studentId: student.studentId, nationalId: student.nationalId } });
  return { id: studentId, deleted: true };
};

const exceptionRow = async (actor: Actor, importId: string, rowNumber: number) => {
  const imported: any = await (RegistryImport as any).findOne({ _id: importId, institution: actor.institution as any });
  if (!imported) throw new Error("Registry exception import not found");
  const row = (imported.rows as RegistryRow[]).find((candidate) => candidate.rowNumber === rowNumber);
  if (!row) throw new Error("Registry exception not found");
  return { imported, row };
};

export const listRegistryExceptions = async (actor: Actor) => {
  const imports: any[] = await (RegistryImport as any).find({ institution: actor.institution as any }).sort({ createdAt: -1 }).limit(20).lean();
  return imports.flatMap((imported) => (Array.isArray(imported.rows) ? imported.rows : [])
    .filter((row: RegistryRow) => row.exceptionStatus === "open" || !["inserted", "updated"].includes(String(row.outcome)))
    .map((row: RegistryRow) => ({ importId: imported._id, importKind: imported.kind, filename: imported.filename, ...row })));
};

export const reconcileImportCounts = (rows: RegistryRow[]) => ({
  total: rows.length,
  processed: rows.filter((row) => ["inserted", "updated", "skipped", "error"].includes(String(row.outcome))).length,
  inserted: rows.filter((row) => row.outcome === "inserted").length,
  updated: rows.filter((row) => row.outcome === "updated").length,
  skipped: rows.filter((row) => row.outcome === "skipped").length,
  errors: rows.filter((row) => row.outcome === "error").length,
});

const recountImport = (imported: any) => {
  const rows: RegistryRow[] = imported.rows || [];
  const counts = reconcileImportCounts(rows);
  imported.totalRows = counts.total;
  imported.processed = counts.processed;
  imported.inserted = counts.inserted;
  imported.updated = counts.updated;
  imported.skipped = counts.skipped;
  imported.errors = counts.errors;
  imported.summary = summarize(rows);
  imported.markModified("rows");
  imported.markModified("summary");
};

const retryExceptionRow = async (actor: Actor, imported: any, row: RegistryRow) => {
  row.outcome = "pending";
  row.exceptionStatus = "open";
  row.failure = null;
  row.resolution = null;
  if (imported.kind === "students") {
    await reconcileRegistryImport(id(imported._id), actor);
    const refreshed: any = await RegistryImport.findById(imported._id).lean();
    const refreshedRow = refreshed?.rows?.find((candidate: RegistryRow) => candidate.rowNumber === row.rowNumber);
    if (refreshedRow) Object.assign(row, refreshedRow, { outcome: "pending", exceptionStatus: "open", failure: null });
  } else await reconcileExceptionRow(actor, imported, row);
  const outcome = await processRegistryRow(imported, row, actor);
  if (outcome === "inserted" || outcome === "updated") row.exceptionStatus = "resolved";
  recountImport(imported);
  await imported.save();
  return outcome;
};

export type ExceptionReconciliation = {
  reconciled: boolean;
  assigned: boolean;
  alreadyAssigned?: boolean;
  studentId?: string;
  message: string;
};

const reconcileExceptionRow = async (actor: Actor, imported: any, row: RegistryRow): Promise<ExceptionReconciliation> => {
  const fail = (message: string, classification: "missing/unmatched" | "conflict" = "missing/unmatched"): ExceptionReconciliation => {
    row.classification = classification;
    row.reasons = [message];
    row.targetStudentId = undefined;
    row.resolution = null;
    return { reconciled: false, assigned: false, message };
  };

  // National ID is the authoritative matching key. Never fall back to names.
  if (!row.nationalId) return fail("Financial Clearance row has no Student's National ID", "conflict");
  if (!row.borrowerNumber) return fail("Exception has no borrower number to assign", "conflict");

  const student: any = await (Student as any).findOne({ institution: actor.institution as any, nationalId: row.nationalId }).lean();
  if (!student) return fail(`Student's National ID (${row.nationalId}) does not exist in Registered Students`);

  const borrowerOwner: any = await (Student as any).findOne({ institution: actor.institution as any, borrowerNumber: row.borrowerNumber, _id: { $ne: student._id } }).lean();
  if (borrowerOwner) {
    row.classification = "conflict";
    row.reasons = ["Borrower number belongs to a different student"];
    row.targetStudentId = id(student._id);
    row.resolution = null;
    return { reconciled: false, assigned: false, studentId: id(student._id), message: "Borrower number belongs to a different student" };
  }
  if (student.borrowerNumber && String(student.borrowerNumber).trim() !== String(row.borrowerNumber).trim()) {
    row.classification = "conflict";
    row.reasons = ["Existing borrower number differs; explicit exception required"];
    row.targetStudentId = id(student._id);
    row.resolution = null;
    return { reconciled: false, assigned: false, studentId: id(student._id), message: "Student already has a different borrower number" };
  }

  try {
    const assignment = await assignBorrowerNumber({ institution: actor.institution, studentId: id(student._id), borrowerNumber: row.borrowerNumber, actor, details: { source: "exception_reconcile", importId: id(imported._id), rowNumber: row.rowNumber } });
    try {
      const existingClearance: any = await (RegistryFinancialClearance as any).findOne({ institution: actor.institution as any, $or: [{ borrowerNumber: row.borrowerNumber }, { accountNumber: row.accountNumber }] });
      if (!existingClearance) {
        const created: any = await (RegistryFinancialClearance as any).create({ institution: actor.institution as any, student: student._id, registryImport: imported._id, rowNumber: row.rowNumber, nationalId: row.nationalId, borrowerNumber: row.borrowerNumber, accountNumber: row.accountNumber, bankName: row.bankName, batchNumber: row.batchNumber || 0, courseOfStudy: row.courseOfStudy, fullnames: row.fullnames, graduating: Boolean(row.graduating), status: row.status || "pending" });
        await recordAudit({ ...registryActor(actor), action: "registry.financial.created", targetCollection: "RegistryFinancialClearance", targetId: id(created._id), details: { importId: id(imported._id), rowNumber: row.rowNumber, borrowerNumber: row.borrowerNumber, accountNumber: row.accountNumber } });
      }
    } catch (clearanceError: any) {
      if (String(clearanceError?.code) !== "11000" && !/duplicate/i.test(String(clearanceError?.message || ""))) throw clearanceError;
    }
    row.targetStudentId = id(student._id);
    row.classification = "matched";
    row.reasons = [assignment.alreadyAssigned ? "Borrower number already assigned" : "Auto-reconciled after National ID correction"];
    row.resolution = null;
    return {
      reconciled: true,
      assigned: !assignment.alreadyAssigned,
      alreadyAssigned: assignment.alreadyAssigned,
      studentId: id(student._id),
      message: assignment.alreadyAssigned ? "Borrower number was already assigned to this student" : `Borrower number ${row.borrowerNumber} assigned to the matching student`,
    };
  } catch (error) {
    const message = error instanceof BorrowerAssignmentError ? error.message : "Borrower number assignment was not applied";
    row.classification = "conflict";
    row.reasons = [message];
    row.targetStudentId = id(student._id);
    row.resolution = null;
    return { reconciled: false, assigned: false, studentId: id(student._id), message };
  }
};

export const findStudentByNationalId = async (actor: Actor, nationalId: unknown) => {
  const normalized = normalizeNationalId(nationalId);
  if (!normalized) throw new Error("National ID is required");
  const student: any = await (Student as any).findOne({
    institution: actor.institution as any,
    $or: [{ nationalId: normalized }, { nationalId: String(nationalId ?? "").trim() }],
  }).lean();
  if (!student) throw new Error("No student found with this National ID");
  return student;
};

export const editRegistryException = async (actor: Actor, importId: string, rowNumber: number, changes: RegistryRow, options?: { autoReconcile?: boolean }) => {
  const { imported, row } = await exceptionRow(actor, importId, rowNumber);
  const fields = imported.kind === "students" ? ["name", "surname", "email", "nationalId", "studentId", "studentStatus", "borrowerNumber"] : ["fullnames", "nationalId", "borrowerNumber", "courseOfStudy", "bankName", "accountNumber"];
  for (const key of fields) if (changes[key] !== undefined) row[key] = key === "nationalId" ? normalizeNationalId(changes[key]) : key === "email" ? String(changes[key]).trim().toLowerCase() : key === "studentStatus" ? Boolean(changes[key]) : String(changes[key]).trim();
  row.classification = "missing/unmatched"; row.reasons = ["Exception edited; reconciliation required"]; row.targetStudentId = undefined;
  let reconciliation: ExceptionReconciliation | undefined;
  if (options?.autoReconcile !== false) {
    const outcome = await retryExceptionRow(actor, imported, row);
    reconciliation = { reconciled: outcome === "inserted" || outcome === "updated", assigned: outcome === "updated", message: outcome === "error" || outcome === "skipped" ? row.failure?.reason || row.reasons?.[0] || "Exception remains unresolved" : "Exception record successfully retried" };
  } else { recountImport(imported); await imported.save(); }
  await recordAudit({ ...registryActor(actor), action: "registry.exception.updated", targetCollection: "RegistryImport", targetId: importId, details: { rowNumber, changes, reconciliation } });
  return { ...row, reconciliation };
};

export const reconcileException = async (actor: Actor, importId: string, rowNumber: number) => {
  const { imported, row } = await exceptionRow(actor, importId, rowNumber);
  const outcome = await retryExceptionRow(actor, imported, row);
  const reconciliation = { reconciled: outcome === "inserted" || outcome === "updated", assigned: outcome === "updated", message: outcome === "error" || outcome === "skipped" ? row.failure?.reason || row.reasons?.[0] || "Exception remains unresolved" : "Exception record successfully retried" };
  await recordAudit({ ...registryActor(actor), action: "registry.exception.reconciled", targetCollection: "RegistryImport", targetId: importId, details: { rowNumber, reconciliation } });
  return { ...row, reconciliation };
};

export const deleteRegistryException = async (actor: Actor, importId: string, rowNumber: number) => {
  const { imported } = await exceptionRow(actor, importId, rowNumber);
  imported.rows = (imported.rows as RegistryRow[]).filter((row) => row.rowNumber !== rowNumber); imported.summary = summarize(imported.rows); await imported.save();
  await recordAudit({ ...registryActor(actor), action: "registry.exception.deleted", targetCollection: "RegistryImport", targetId: importId, details: { rowNumber } });
  return { importId, rowNumber, deleted: true };
};

export const addExceptionToRegistry = async (actor: Actor, importId: string, rowNumber: number, input: RegistryRow) => {
  const { imported, row } = await exceptionRow(actor, importId, rowNumber);
  const fullnames = String(input.fullnames || row.fullnames || "").trim().split(/\s+/); const surname = String(input.surname || fullnames.pop() || ""); const name = String(input.name || fullnames.join(" "));
  const created = await addRegistryStudent(actor, { ...input, name, surname, nationalId: input.nationalId || row.nationalId, borrowerNumber: input.borrowerNumber || row.borrowerNumber, studentId: input.studentId || row.nationalId || row.borrowerNumber, email: input.email || `${String(input.studentId || row.nationalId || row.borrowerNumber).toLowerCase()}@registry.invalid` });
  row.targetStudentId = id(created._id); row.classification = "matched"; row.reasons = ["Added to registry from exception"]; imported.summary = summarize(imported.rows); imported.markModified("rows"); imported.markModified("summary"); await imported.save();
  await recordAudit({ ...registryActor(actor), action: "registry.exception.addedToRegistry", targetCollection: "RegistryImport", targetId: importId, details: { rowNumber, studentId: id(created._id) } });
  return created;
};
