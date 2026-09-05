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
  const source = XLSX.utils.sheet_to_json<RegistryRow>(workbook.Sheets[firstSheet]!, { defval: "" });
  if (!source.length) throw new Error("Spreadsheet has no data rows");
  const headers = Object.keys(source[0] || {}).map(normalizeHeader);
  const missing = requiredHeaders[input.kind].filter((group) => !group.some((header) => headers.includes(normalizeHeader(header))));
  if (missing.length) throw new Error(`Missing required columns: ${missing.map((group) => group[0]).join(", ")}`);

  const rows = source.map((raw, index) => {
    const a = aliases[input.kind];
    const row: RegistryRow = { rowNumber: index + 2, source: raw, classification: "missing/unmatched", reasons: [], resolution: null };
      if (input.kind === "students") { const nationalId = normalizeNationalId(value(raw, a.nationalId || [])); Object.assign(row, { name: value(raw, a.name || []), surname: value(raw, a.surname || []), email: value(raw, a.email || []).toLowerCase(), nationalId, studentId: value(raw, a.studentId || []), studentStatus: asBoolean(value(raw, a.studentStatus || [])), borrowerNumber: value(raw, a.borrowerNumber || []) }); }
     else Object.assign(row, { fullnames: value(raw, a.fullnames || []), nationalId: normalizeNationalId(value(raw, a.nationalId || [])), borrowerNumber: value(raw, a.borrowerNumber || []), courseOfStudy: value(raw, a.courseOfStudy || []), bankName: value(raw, a.bankName || []), accountNumber: value(raw, a.accountNumber || []), batchNumber: Number(value(raw, a.batchNumber || [])) || 0, graduating: asBoolean(value(raw, a.graduating || [])), status: value(raw, a.status || []) || "pending" });
     const required = input.kind === "students" ? [row.name, row.surname, row.email, row.studentId, row.nationalId, value(raw, a.studentStatus || [])] : [row.fullnames, row.nationalId, row.borrowerNumber, row.courseOfStudy, row.bankName, row.accountNumber];
    if (required.some((item) => !String(item).trim())) { row.classification = "conflict"; row.reasons = ["One or more required values are blank"]; }
    else if (input.kind === "students" && !validStatus(value(raw, a.studentStatus || []))) { row.classification = "conflict"; row.reasons = ["studentStatus must be a recognized boolean/status value"]; }
     input.onProgress?.({ processed: index + 1, total: source.length, inserted: index + 1, skipped: 0, errors: 0, percent: Math.round(((index + 1) / source.length) * 70), message: "Validating Registry records" });
     return row;
  });
  classify(rows, input.kind);
  const imported: any = await RegistryImport.create({ institution: input.actor.institution as any, uploadedBy: input.actor._id as any, kind: input.kind, filename: input.filename, rows, summary: summarize(rows) });
  await reconcileRegistryImport(imported._id.toString(), input.actor);
  input.onProgress?.({ processed: rows.length, total: rows.length, inserted: rows.filter((row) => row.classification === "matched").length, skipped: rows.filter((row) => row.classification === "duplicate").length, errors: rows.filter((row) => row.classification === "conflict" || row.classification === "missing/unmatched").length, percent: 90, message: "Reconciling Registry records" });
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

export const applyRegistryImport = async (importId: string, actor: Actor) => {
  const imported: any = await (RegistryImport as any).findOne({ _id: importId, institution: actor.institution as any });
  if (!imported) throw new Error("Registry import not found");
  let applied = 0; let nationalIdsBackfilled = 0; const skipped: Array<{ rowNumber: number; reason: string }> = [];
  for (const row of imported.rows as RegistryRow[]) {
    if (imported.kind === "students") {
      if (row.classification === "conflict" || row.classification === "duplicate") {
        skipped.push({ rowNumber: row.rowNumber, reason: "Conflict or duplicate requires review" });
        continue;
      }
       const existing: any = await (Student as any).findOne({ institution: actor.institution as any, $or: [{ studentId: row.studentId }, { email: row.email }, ...(row.nationalId ? [{ nationalId: row.nationalId }] : [])] });
      if (existing) {
        if (row.nationalId) {
          const currentNationalId = normalizeNationalId(existing.nationalId || "");
          if (!currentNationalId) {
            const nationalIdOwner: any = await (Student as any).findOne({ institution: actor.institution as any, nationalId: row.nationalId, _id: { $ne: existing._id } });
            if (nationalIdOwner) {
              skipped.push({ rowNumber: row.rowNumber, reason: "National ID belongs to another student" });
              continue;
            }
            try {
              const nidUpdate = await (Student as any).updateOne({ _id: existing._id, institution: actor.institution as any, $or: [{ nationalId: { $exists: false } }, { nationalId: null }, { nationalId: "" }] }, { $set: { nationalId: row.nationalId } });
              if (nidUpdate.modifiedCount === 1) {
                existing.nationalId = row.nationalId;
                nationalIdsBackfilled += 1;
                await recordAudit({ ...registryActor(actor), action: "registry.student.nationalId.backfilled", targetCollection: "Student", targetId: id(existing._id), details: { importId, rowNumber: row.rowNumber, studentId: existing.studentId, nationalId: row.nationalId } });
              } else {
                const refreshed: any = await (Student as any).findOne({ _id: existing._id, institution: actor.institution as any }).lean();
                if (refreshed && normalizeNationalId(refreshed.nationalId || "") !== normalizeNationalId(row.nationalId)) {
                  skipped.push({ rowNumber: row.rowNumber, reason: "Student National ID changed before it could be updated" });
                  continue;
                }
                if (refreshed) existing.nationalId = refreshed.nationalId;
              }
            } catch (error: any) {
              if (String(error?.code) === "11000" || /duplicate/i.test(String(error?.message || ""))) {
                skipped.push({ rowNumber: row.rowNumber, reason: "National ID belongs to another student" });
                continue;
              }
              throw error;
            }
          } else if (currentNationalId !== normalizeNationalId(row.nationalId)) {
            skipped.push({ rowNumber: row.rowNumber, reason: "Existing National ID differs; explicit exception required" });
            continue;
          }
        }
        if (row.borrowerNumber && !existing.borrowerNumber && row.resolution?.action === "assignBorrower") {
          const owner: any = await (Student as any).findOne({ institution: actor.institution as any, borrowerNumber: row.borrowerNumber, _id: { $ne: existing._id } });
          if (owner) skipped.push({ rowNumber: row.rowNumber, reason: "Borrower number belongs to another student" });
           else {
             try {
               const result = await assignBorrowerNumber({ institution: actor.institution, studentId: id(existing._id), borrowerNumber: row.borrowerNumber, actor, details: { importId, rowNumber: row.rowNumber } });
               if (!result.alreadyAssigned) applied += 1;
             } catch (error) {
               skipped.push({ rowNumber: row.rowNumber, reason: error instanceof BorrowerAssignmentError ? error.message : "Borrower number assignment was not applied" });
             }
           }
        } else skipped.push({ rowNumber: row.rowNumber, reason: "Student already exists; no approved change" });
        continue;
      }
       const owner: any = row.borrowerNumber ? await (Student as any).findOne({ institution: actor.institution as any, borrowerNumber: row.borrowerNumber }) : null;
       if (owner) { skipped.push({ rowNumber: row.rowNumber, reason: "Borrower number belongs to another student" }); continue; }
        const createdStudent: any = await (Student as any).create({ institution: actor.institution as any, studentId: row.studentId, email: row.email, name: row.name, surname: row.surname, studentStatus: row.studentStatus, ...(row.nationalId ? { nationalId: row.nationalId } : {}) });
        await recordAudit({ action: "registry.student.created", actorId: id(actor._id), ...(actor.email ? { actorEmail: actor.email } : {}), actorRole: roleName(actor), targetCollection: "Student", details: { studentId: row.studentId, nationalId: row.nationalId } });
       if (row.borrowerNumber) {
         try { await assignBorrowerNumber({ institution: actor.institution, studentId: id(createdStudent._id), borrowerNumber: row.borrowerNumber, actor, details: { importId, rowNumber: row.rowNumber } }); }
         catch (error) { skipped.push({ rowNumber: row.rowNumber, reason: error instanceof BorrowerAssignmentError ? error.message : "Borrower number assignment was not applied" }); }
       }
       applied += 1;
      continue;
    }
    const targetId = row.resolution?.action === "assignBorrower" ? row.resolution.targetStudentId : row.classification === "matched" ? row.targetStudentId : undefined;
    if (!targetId || !row.borrowerNumber) {
      const detail = Array.isArray(row.reasons) && row.reasons.length ? row.reasons.join("; ") : "";
      let reason = detail || "Row could not be applied";
      if (row.classification === "duplicate") reason = detail || "Duplicate row in upload";
      else if (row.classification === "conflict") reason = detail || "Conflict requires review";
      else if (row.classification === "missing/unmatched") reason = detail ? `${detail} (National ID: ${row.nationalId || "missing"})` : `Student's National ID (${row.nationalId || "missing"}) does not exist in Registered Students`;
      else if (!row.borrowerNumber) reason = "Row has no borrower number";
      skipped.push({ rowNumber: row.rowNumber, reason });
      continue;
    }
     const student: any = await (Student as any).findOne({ _id: targetId, institution: actor.institution as any });
     if (!student) { skipped.push({ rowNumber: row.rowNumber, reason: "Target student no longer exists" }); continue; }
      try {
        const assignment = await assignBorrowerNumber({ institution: actor.institution, studentId: id(student._id), borrowerNumber: row.borrowerNumber, actor, details: { importId, rowNumber: row.rowNumber } });
        if (!assignment.alreadyAssigned) applied += 1;
      } catch (error) {
        skipped.push({ rowNumber: row.rowNumber, reason: error instanceof BorrowerAssignmentError ? error.message : "Borrower number assignment was not applied" });
        continue;
      }
     const existingClearance: any = await (RegistryFinancialClearance as any).findOne({ institution: actor.institution as any, $or: [{ borrowerNumber: row.borrowerNumber }, { accountNumber: row.accountNumber }] });
      if (!existingClearance) {
         const created: any = await (RegistryFinancialClearance as any).create({ institution: actor.institution as any, student: student._id, registryImport: imported._id, rowNumber: row.rowNumber, nationalId: row.nationalId, borrowerNumber: row.borrowerNumber, accountNumber: row.accountNumber, bankName: row.bankName, batchNumber: row.batchNumber || 0, courseOfStudy: row.courseOfStudy, fullnames: row.fullnames, graduating: Boolean(row.graduating), status: row.status || "pending" });
        await recordAudit({ ...registryActor(actor), action: "registry.financial.created", targetCollection: "RegistryFinancialClearance", targetId: id(created._id), details: { importId, rowNumber: row.rowNumber, borrowerNumber: row.borrowerNumber, accountNumber: row.accountNumber } });
      }
    }
  imported.status = "applied"; imported.markModified("rows"); await imported.save();
  await recordAudit({ action: "registry.assignments.applied", actorId: id(actor._id), ...(actor.email ? { actorEmail: actor.email } : {}), actorRole: roleName(actor), targetCollection: "RegistryImport", targetId: importId, details: { applied, skipped, nationalIdsBackfilled } });
  return { importId, applied, skipped, status: imported.status };
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
  const imported: any = await (RegistryImport as any).findOne({ _id: importId, institution: actor.institution as any, kind: "financial" });
  if (!imported) throw new Error("Financial exception import not found");
  const row = (imported.rows as RegistryRow[]).find((candidate) => candidate.rowNumber === rowNumber);
  if (!row) throw new Error("Registry exception not found");
  return { imported, row };
};

export const listRegistryExceptions = async (actor: Actor) => {
  const latest: any = await (RegistryImport as any).findOne({ institution: actor.institution as any, kind: "financial" }).sort({ createdAt: -1 }).lean();
  return latest ? (latest.rows as RegistryRow[]).filter((row) => row.classification !== "matched").map((row) => ({ importId: latest._id, ...row })) : [];
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
  for (const key of ["fullnames", "nationalId", "borrowerNumber", "courseOfStudy", "bankName", "accountNumber"]) if (changes[key] !== undefined) row[key] = key === "nationalId" ? normalizeNationalId(changes[key]) : String(changes[key]).trim();
  row.classification = "missing/unmatched"; row.reasons = ["Exception edited; reconciliation required"]; row.resolution = null; row.targetStudentId = undefined;
  let reconciliation: ExceptionReconciliation | undefined;
  if (options?.autoReconcile !== false) reconciliation = await reconcileExceptionRow(actor, imported, row);
  imported.summary = summarize(imported.rows); imported.markModified("rows"); imported.markModified("summary"); await imported.save();
  await recordAudit({ ...registryActor(actor), action: "registry.exception.updated", targetCollection: "RegistryImport", targetId: importId, details: { rowNumber, changes, reconciliation } });
  return { ...row, reconciliation };
};

export const reconcileException = async (actor: Actor, importId: string, rowNumber: number) => {
  const { imported, row } = await exceptionRow(actor, importId, rowNumber);
  const reconciliation = await reconcileExceptionRow(actor, imported, row);
  imported.summary = summarize(imported.rows); imported.markModified("rows"); imported.markModified("summary"); await imported.save();
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
