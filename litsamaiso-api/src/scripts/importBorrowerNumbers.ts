/**
 * Assign borrower numbers from a financial clearance spreadsheet to existing
 * Student records and their linked student User accounts.
 *
 *   npm run import:borrowers -- --file "../BOTHO NEW INTAKE 2026-2027 LIST 3 (1).xlsx"            # dry run
 *   npm run import:borrowers -- --file "../BOTHO NEW INTAKE 2026-2027 LIST 3 (1).xlsx" --apply    # write
 *
 * Options:
 *   --file <path>         spreadsheet to read (required)
 *   --institution <id>    institution to match within (defaults to the institution most of the
 *                         sheet's student numbers belong to)
 *
 * Sheet names are "Surname, Name Middle Middle" (comma optional). The "Student No" column is often
 * wrong, so it is never trusted on its own:
 *   id+name    studentId/nationalId matches and surname + first name agree
 *   id+name~   studentId/nationalId and surname match, first name is a near spelling
 *   name       surname + first name identify exactly one student (sheet number ignored)
 * Anything else is reported and skipped. Students without a User account get the Student record
 * patched, and registration copies the number onto their account later.
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";
import XLSX from "xlsx";
import { connectDatabase, getMongoUri } from "../config/database.js";
import { AuditLog } from "../models/AuditLog.js";
import { Institution } from "../models/Institution.js";
import "../models/Role.js"; // registers the model populate("role") needs
import { Student } from "../models/Student.js";
import { User } from "../models/User.js";
import { assignBorrowerNumber } from "../services/borrowerAssignmentService.js";

type Status = "assign" | "sync_user" | "done" | "conflict" | "not_found" | "invalid";
type MatchedBy = "id+name" | "id+name~" | "name";

type Row = {
  line: number;
  name: string;
  sheetId: string;
  borrowerNumber: string;
  status: Status;
  matchedBy?: MatchedBy;
  student?: any;
  userId?: string;
  hasUser?: boolean;
  note?: string;
};

type ParsedName = { surname: string[]; given: string[] };

const argValue = (flag: string) => {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

const shouldApply = process.argv.includes("--apply");
const filePath = argValue("--file");
const institutionArg = argValue("--institution");

const clean = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim();

const normalize = (value: unknown) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s,]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const words = (value: string) => value.split(/[\s,]+/).filter(Boolean);

// "Koloko, Rethabile Grace" / "Sekola Jane Johannes" / "Nengi Tsehlana, Bohlokoa Tsehlana"
const parseSheetName = (raw: string): ParsedName => {
  const value = normalize(raw);
  const comma = value.indexOf(",");
  if (comma >= 0) return { surname: words(value.slice(0, comma)), given: words(value.slice(comma + 1)) };
  const [surname, ...given] = words(value);
  return { surname: surname ? [surname] : [], given };
};

const levenshtein = (a: string, b: string) => {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[b.length]!;
};

const surnameMatches = (student: any, parsed: ParsedName) => {
  const dbSurname = words(normalize(student.surname));
  if (!dbSurname.length || !parsed.surname.length) return false;
  return dbSurname.join(" ") === parsed.surname.join(" ") || dbSurname.some((word) => parsed.surname.includes(word));
};

// "exact": the sheet's first name is one of the student's first names; "close": a near spelling.
const nameAgreement = (student: any, parsed: ParsedName): "exact" | "close" | null => {
  if (!surnameMatches(student, parsed)) return null;
  const first = parsed.given[0];
  const dbFirstNames = words(normalize(student.name));
  if (!first || !dbFirstNames.length) return null;
  if (dbFirstNames.includes(first)) return "exact";
  if (dbFirstNames.some((name) => levenshtein(name, first) <= Math.max(1, Math.floor(first.length / 4)))) return "close";
  return null;
};

const describe = (students: any[]) =>
  students.map((s) => `${s.studentId} ${s.name} ${s.surname}${s.borrowerNumber ? ` [has ${s.borrowerNumber}]` : ""}`).join("; ");

const readSheet = (file: string) => {
  const workbook = XLSX.read(fs.readFileSync(file));
  const sheet = workbook.Sheets[workbook.SheetNames[0]!]!;
  const grid: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });

  const headerIndex = grid.findIndex((row) => row.some((cell) => /borrower/i.test(String(cell))));
  if (headerIndex < 0) throw new Error("Could not find a header row with a 'Borrower' column");
  const header = grid[headerIndex]!.map((cell) => String(cell).toLowerCase());
  const column = (pattern: RegExp) => {
    const index = header.findIndex((cell) => pattern.test(cell));
    if (index < 0) throw new Error(`Missing column matching ${pattern}`);
    return index;
  };
  const nameCol = column(/name/);
  const idCol = column(/student\s*no/);
  const borrowerCol = column(/borrower/);

  return grid
    .map((row, index) => ({
      line: index + 1,
      name: clean(row[nameCol]),
      sheetId: clean(row[idCol]).replace(/\s/g, ""),
      borrowerNumber: clean(row[borrowerCol]).replace(/\s/g, ""),
    }))
    .slice(headerIndex + 1)
    .filter((row) => row.name || row.sheetId || row.borrowerNumber);
};

// Most sheet student numbers are right, so the institution they point to is the sheet's institution.
const detectInstitution = async (sheetIds: string[]) => {
  const ids = sheetIds.filter(Boolean);
  const counts: Array<{ _id: unknown; count: number }> = await Student.aggregate([
    { $match: { $or: [{ studentId: { $in: ids } }, { nationalId: { $in: ids } }] } },
    { $group: { _id: "$institution", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);
  if (!counts.length) throw new Error("No sheet student numbers matched any student; rerun with --institution <id>");
  if (counts.length > 1) console.log(`Note: sheet numbers matched students in ${counts.length} institutions; using the most common. Pass --institution to override.`);
  return String(counts[0]!._id);
};

const findStudent = async (row: Pick<Row, "sheetId" | "name">, institution: string) => {
  const parsed = parseSheetName(row.name);
  const idCandidates: any[] = row.sheetId
    ? await Student.find({ institution, $or: [{ studentId: row.sheetId }, { nationalId: row.sheetId }] }).lean()
    : [];

  for (const level of ["exact", "close"] as const) {
    const agreeing = idCandidates.filter((student) => nameAgreement(student, parsed) === level);
    if (agreeing.length === 1) return { student: agreeing[0], matchedBy: (level === "exact" ? "id+name" : "id+name~") as MatchedBy };
  }

  const escape = (word: string) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const surnamePattern = new RegExp(`(^|\\s)(${parsed.surname.map(escape).join("|")})(\\s|$)`, "i");
  const surnameCandidates: any[] = parsed.surname.length ? await Student.find({ institution, surname: surnamePattern }).lean() : [];
  const byName = surnameCandidates.filter((student) => nameAgreement(student, parsed) === "exact");

  const idNote = idCandidates.length ? `sheet no. points to ${describe(idCandidates)}` : row.sheetId ? "sheet no. not in DB" : "";
  if (byName.length === 1) return { student: byName[0], matchedBy: "name" as MatchedBy, note: idNote };
  if (byName.length > 1) return { problem: `${byName.length} students named like this: ${describe(byName)}${idNote ? `; ${idNote}` : ""}` };
  return { problem: idCandidates.length ? `name does not match; ${idNote}` : undefined, hints: surnameCandidates };
};

const findStudentUser = async (student: any) => {
  const user: any = await User.findOne({ institution: student.institution, studentId: student.studentId }).populate("role", "name").lean();
  if (!user) return null;
  const role = String(user.role?.name || user.role || "").toLowerCase();
  return role && role !== "student" ? null : user;
};

const classify = async (input: Omit<Row, "status">, institution: string): Promise<Row> => {
  const row: Row = { ...input, status: "invalid" };
  if (!row.name) return { ...row, note: "no name in sheet" };
  if (!/^\d{6,}$/.test(row.borrowerNumber)) return { ...row, note: `borrower number "${row.borrowerNumber}" looks wrong` };

  const found = await findStudent(row, institution);
  if (!found.student) {
    if (found.problem) return { ...row, status: "conflict", note: found.problem };
    const hints = found.hints?.slice(0, 3) ?? [];
    return { ...row, status: "not_found", note: hints.length ? `same surname: ${describe(hints)}` : "no student with this name" };
  }

  const { student, matchedBy } = found;
  const notes = [found.note, matchedBy === "id+name~" ? `DB name: ${student.name} ${student.surname}` : ""].filter(Boolean);
  Object.assign(row, { student, matchedBy });
  const current = clean(student.borrowerNumber);
  const withNotes = (extra?: string) => ({ ...row, note: [...notes, extra].filter(Boolean).join("; ") });

  const owner: any = await Student.findOne({ institution: student.institution, borrowerNumber: row.borrowerNumber, _id: { $ne: student._id } }).lean();
  if (owner) return { ...withNotes(`borrower number already on student ${owner.studentId} (${owner.name} ${owner.surname})`), status: "conflict" };
  if (current && current !== row.borrowerNumber) return { ...withNotes(`student already has ${current}`), status: "conflict" };

  const user = await findStudentUser(student);
  row.hasUser = Boolean(user);
  if (user) row.userId = String(user._id);
  const userCurrent = clean(user?.borrowerNumber);
  if (userCurrent && userCurrent !== row.borrowerNumber) return { ...withNotes(`user account already has ${userCurrent}`), status: "conflict" };

  if (current && (!user || userCurrent)) return { ...withNotes(), status: "done" };
  if (current) return { ...withNotes("student has it, user account missing it"), status: "sync_user" };
  return { ...withNotes(user ? undefined : "no account yet"), status: "assign" };
};

const run = async () => {
  if (!filePath) throw new Error('Usage: --file "<spreadsheet.xlsx>" [--institution <id>] [--apply]');
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) throw new Error(`File not found: ${resolved}`);

  await connectDatabase();
  const target = getMongoUri().replace(/\/\/[^@/]*@/, "//***@").replace(/\?.*$/, "");
  console.log(`\n${shouldApply ? "APPLYING" : "DRY RUN"} against ${target} (db: ${mongoose.connection.db?.databaseName})`);
  console.log(`Sheet: ${resolved}`);

  const sheetRows = readSheet(resolved);
  const institutionId = institutionArg || (await detectInstitution(sheetRows.map((r) => r.sheetId)));
  const institution: any = await Institution.findById(institutionId).lean();
  if (!institution) throw new Error(`Institution ${institutionId} not found`);
  console.log(`Institution: ${institution.name} (${institution._id})\n`);

  const seenBorrowers = new Map<string, number>();
  const rows: Row[] = [];
  for (const input of sheetRows) {
    const duplicate = seenBorrowers.get(input.borrowerNumber);
    seenBorrowers.set(input.borrowerNumber, input.line);
    rows.push(duplicate ? { ...input, status: "conflict", note: `borrower number duplicates sheet line ${duplicate}` } : await classify(input, institutionId));
  }

  const byStudent = new Map<string, Row>();
  for (const row of rows.filter((r) => r.student)) {
    const key = String(row.student._id);
    const first = byStudent.get(key);
    if (!first) {
      byStudent.set(key, row);
      continue;
    }
    for (const r of [first, row]) Object.assign(r, { status: "conflict", note: `sheet lines ${first.line} and ${row.line} both match student ${row.student.studentId}` });
  }

  const order: Status[] = ["assign", "sync_user", "done", "conflict", "not_found", "invalid"];
  const labels: Record<Status, string> = {
    assign: "WILL ASSIGN",
    sync_user: "WILL SYNC USER",
    done: "ALREADY DONE",
    conflict: "CONFLICT (skipped)",
    not_found: "NOT FOUND (skipped)",
    invalid: "INVALID ROW (skipped)",
  };
  for (const status of order) {
    const group = rows.filter((r) => r.status === status);
    if (!group.length) continue;
    console.log(`── ${labels[status]}: ${group.length}`);
    console.table(
      group.map((r) => ({
        line: r.line,
        name: r.name,
        sheetId: r.sheetId,
        matchedBy: r.matchedBy ?? "",
        studentId: r.student?.studentId ?? "",
        borrower: r.borrowerNumber,
        user: r.student ? (r.hasUser ? "yes" : "no") : "",
        note: r.note ?? "",
      })),
    );
  }

  const pending = rows.filter((r) => r.status === "assign" || r.status === "sync_user");
  const counts = Object.fromEntries(order.map((s) => [s, rows.filter((r) => r.status === s).length]));
  console.log("Summary:", { total: rows.length, ...counts });

  if (!shouldApply) {
    console.log(`\nDry run only. ${pending.length} student(s) would be updated. Rerun with --apply to write.`);
    return;
  }

  const applied: Array<Record<string, unknown>> = [];
  const failed: Array<Record<string, unknown>> = [];
  for (const row of pending) {
    try {
      const result = await assignBorrowerNumber({ institution: row.student.institution, studentId: String(row.student._id), borrowerNumber: row.borrowerNumber });
      applied.push({ studentId: row.student.studentId, borrowerNumber: row.borrowerNumber, matchedBy: row.matchedBy, userId: result.userId, userSynchronized: result.userSynchronized });
    } catch (error) {
      failed.push({ line: row.line, studentId: row.student.studentId, borrowerNumber: row.borrowerNumber, error: (error as Error).message });
    }
  }

  await AuditLog.create({
    action: "registry.borrower.import",
    targetCollection: "Student",
    details: { file: path.basename(resolved), institution: institutionId, applied, failed },
  });

  console.log(`\nApplied ${applied.length}/${pending.length}. Users synchronized: ${applied.filter((a) => a.userSynchronized).length}.`);
  if (failed.length) {
    console.log("Failures:");
    console.table(failed);
    process.exitCode = 1;
  }
};

run()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
