import { Types } from "mongoose";
import XLSX from "xlsx";
import { MAX_SESSION_HOURS, MAX_SESSIONS_PER_WEEK } from "../constants/timetabling.js";
import { CourseModule } from "../models/CourseModule.js";
import { Lecturer } from "../models/Lecturer.js";
import { Room } from "../models/Room.js";
import { Student } from "../models/Student.js";
import { TimetablingImport } from "../models/TimetablingImport.js";
import AppError from "../utils/errors.js";
import { withOptionalTransaction } from "../utils/transaction.js";
import {
  audit,
  flag,
  institutionOf,
  isDuplicateKey,
  lecturerInput,
  moduleFields,
  roomInput,
  termOf,
  type Actor,
  type Term,
} from "./timetablingService.js";

// Registry's spreadsheet of rooms, lecturers, modules and enrolments. One workbook can hold any of the four
// sheets. Rooms are matched by code, lecturers by email and modules by code within the term, and a match is
// updated from the row. A blank cell keeps what is there. Nothing is ever deleted, and enrolments are only added.

export type ImportKind = "rooms" | "lecturers" | "modules" | "enrolments";

// `required` columns must be on the sheet. A `requiredForNew` column can be left off, but a row that adds a
// new record must fill it in. `example` is what the column guide shows; it is never written to a file.
type Column = { label: string; aliases: string[]; required?: boolean; requiredForNew?: boolean; help: string; example: string };

const NEW_MODULE_DEFAULTS = { sessionsPerWeek: 2, durationHours: 2 };

// The first alias of each column is its name in the template. Columns are matched to the template's names
// loosely, so a sheet Registry already keeps (e.g. "Room", "Seats") can be uploaded as it is.
const COLUMNS: Record<ImportKind, Record<string, Column>> = {
  rooms: {
    code: { label: "Room code", aliases: ["room code", "room", "code", "room number", "room no", "venue"], required: true, help: "Required. For example A101 or LAB1.", example: "A101" },
    building: { label: "Building", aliases: ["building", "block", "location"], help: "Optional.", example: "Block A" },
    capacity: { label: "Capacity", aliases: ["capacity", "seats", "number of seats", "size"], required: true, help: "Number of seats. Required for a new room.", example: "60" },
    isComputerized: { label: "Computer lab", aliases: ["computer lab", "computerised", "computerized", "computers", "lab"], help: "Yes or No. Blank means No for a new room.", example: "No" },
    roomType: { label: "Room type", aliases: ["room type", "type"], help: "lecture theatre, 30-seater or computer lab. Defaults to 30-seater.", example: "30-seater" },
    active: { label: "In use", aliases: ["in use", "active", "available"], help: "Yes or No. Blank means Yes for a new room. A room not in use is left off timetables.", example: "Yes" },
  },
  lecturers: {
    name: { label: "Name", aliases: ["name", "full name", "lecturer name", "lecturer"], required: true, help: "Required for a new lecturer.", example: "Lineo Mohapi" },
    email: { label: "Email", aliases: ["email", "email address", "e mail"], required: true, help: "Required. This is how a lecturer is recognised.", example: "lineo.mohapi@botho.example" },
    staffNumber: { label: "Staff number", aliases: ["staff number", "staff no", "staff id", "employee number"], help: "Optional.", example: "BU0042" },
  },
  modules: {
    code: { label: "Module code", aliases: ["module code", "code", "course code", "module"], required: true, help: "Required. For example CSC101.", example: "CSC101" },
    name: { label: "Module name", aliases: ["module name", "name", "title", "module title", "course name"], requiredForNew: true, help: "Optional. Required for a new module.", example: "Introduction to Programming" },
    lecturer: { label: "Lecturer email", aliases: ["lecturer email", "lecturer", "lecturer name", "email"], requiredForNew: true, help: "The lecturer must be on the Lecturers sheet or already added. Their name works too if no other lecturer has it. Required for a new module.", example: "lineo.mohapi@botho.example" },
    sessionsPerWeek: { label: "Classes per week", aliases: ["classes per week", "sessions per week", "classes", "sessions"], help: `1 to ${MAX_SESSIONS_PER_WEEK}. Blank means ${NEW_MODULE_DEFAULTS.sessionsPerWeek} for a new module.`, example: "2" },
    durationHours: { label: "Hours per class", aliases: ["hours per class", "hours per session", "hours", "duration", "class length"], help: `1 to ${MAX_SESSION_HOURS}. Blank means ${NEW_MODULE_DEFAULTS.durationHours} for a new module.`, example: "2" },
    requiresComputers: { label: "Computer lab", aliases: ["computer lab", "needs computer lab", "needs computers", "computers", "lab"], help: "Yes or No. Blank means No for a new module.", example: "Yes" },
    credits: { label: "Credits", aliases: ["credits", "no credits", "credit"], help: "Module credits, 1 to 100. Default is 10.", example: "12" },
    batches: { label: "Batches", aliases: ["batches", "no. of projected batches", "number of batches"], help: "Number of parallel class groups, 1 to 20. Default is 1.", example: "1" },
    preferredRoomType: { label: "Room type preference", aliases: ["room type", "preferred room type", "room type (lecture theatre/30 seater)"], help: "lecture theatre, 30-seater, computer lab, or any.", example: "computer lab" },
    specificRequirements: { label: "Specific requirements", aliases: ["specific requirements", "requirements", "notes"], help: "Any special room requirements.", example: "Projector" },
  },
  enrolments: {
    module: { label: "Module code", aliases: ["module code", "module", "code", "course code"], required: true, help: "Required. A module on the Modules sheet or already in the semester.", example: "CSC101" },
    studentId: { label: "Student number", aliases: ["student number", "student id", "student no", "studentid", "registration number", "reg no"], required: true, help: "Required. One row per student per module. The student must be in the Student Registry.", example: "0012" },
  },
};

const KINDS: ImportKind[] = ["rooms", "lecturers", "modules", "enrolments"];
const SHEET_TITLES: Record<ImportKind, string> = { rooms: "Rooms", lecturers: "Lecturers", modules: "Modules", enrolments: "Enrolments" };
const SHEET_NAMES: Record<ImportKind, string[]> = {
  rooms: ["rooms", "room", "venues"],
  lecturers: ["lecturers", "lecturer", "staff"],
  modules: ["modules", "module", "courses"],
  enrolments: ["enrolments", "enrollments", "enrolment", "enrollment", "students", "module students"],
};
// A sheet with an unknown name is recognised by its columns. A modules sheet also has a name and an email,
// so it is tried before lecturers.
const DETECT_ORDER: ImportKind[] = ["enrolments", "rooms", "modules", "lecturers"];
const NOTE_SHEETS = ["instructions", "read me", "readme", "help", "notes"];

const MAX_ROWS = 100_000;
const MAX_ISSUES_SHOWN = 300;

const normalize = (value: string) =>
  value.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim();

const cellText = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "yes" : "no";
  return String(value).trim();
};

// ---------------------------------------------------------------------------
// Reading the workbook
// ---------------------------------------------------------------------------

export type ImportRow = { row: number; values: Record<string, string | undefined> };
export type ImportSheet = { name: string; kind: ImportKind; missing: string[]; rows: ImportRow[] };

const mapColumns = (kind: ImportKind, headers: string[]) => {
  const normalized = headers.map((header) => normalize(header));
  const claimed = new Set<number>();
  const columns: Record<string, number> = {};
  const fields = Object.entries(COLUMNS[kind]);
  // Exact names first, so "Module name" goes to the name even though it also contains "module"
  const pass = (matches: (header: string, alias: string) => boolean) => {
    for (const [field, column] of fields) {
      if (field in columns) continue;
      for (const alias of column.aliases) {
        const index = normalized.findIndex((header, i) => header !== "" && !claimed.has(i) && matches(header, alias));
        if (index >= 0) {
          columns[field] = index;
          claimed.add(index);
          break;
        }
      }
    }
  };
  pass((header, alias) => header === alias);
  // Then a header that contains a name, like "Room no." or "Lab? (Yes/No)", but not a sentence that happens to mention one
  pass((header, alias) => header.split(" ").length <= 6 && ` ${header} `.includes(` ${alias} `));
  const missing = fields.filter(([field, column]) => column.required && !(field in columns)).map(([, column]) => column.label);
  return { columns, missing };
};

const kindOf = (sheetName: string, headers: string[]): ImportKind | undefined => {
  const name = normalize(sheetName);
  return KINDS.find((kind) => SHEET_NAMES[kind].includes(name))
    ?? DETECT_ORDER.find((kind) => mapColumns(kind, headers).missing.length === 0);
};

export const parseWorkbook = (buffer: Buffer): { sheets: ImportSheet[]; ignored: string[] } => {
  let workbook: XLSX.WorkBook;
  try {
    // raw keeps CSV cells as typed, so student numbers like 0012 keep their zeros
    workbook = XLSX.read(buffer, { type: "buffer", raw: true });
  } catch {
    throw new AppError("That file couldn't be read. Upload an Excel (.xlsx or .xls) or CSV file.");
  }

  const sheets: ImportSheet[] = [];
  const ignored: string[] = [];
  let totalRows = 0;
  for (const name of workbook.SheetNames) {
    if (NOTE_SHEETS.includes(normalize(name))) continue;
    const worksheet = workbook.Sheets[name];
    if (!worksheet?.["!ref"]) continue;
    const firstRow = XLSX.utils.decode_range(worksheet["!ref"]).s.r;
    const grid = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, defval: "", raw: true, blankrows: true });
    const filled = grid.flatMap((cells, index) => (cells.some((cell) => cellText(cell) !== "") ? [index] : []));
    if (!filled.length) continue;

    // The header row is usually first, but a sheet Registry already keeps may have a title above it
    const headerRowOf = (index: number) => {
      const headers = (grid[index] ?? []).map(cellText);
      const kind = kindOf(name, headers);
      return kind ? { index, kind, ...mapColumns(kind, headers) } : undefined;
    };
    const tried = filled.slice(0, 10).map(headerRowOf);
    const header = tried.find((found) => found && !found.missing.length) ?? tried[0];
    if (!header) {
      ignored.push(name);
      continue;
    }

    const { index: headerIndex, kind, columns, missing } = header;
    const rows: ImportRow[] = [];
    grid.slice(headerIndex + 1).forEach((cells, offset) => {
      const values: Record<string, string | undefined> = {};
      for (const [field, index] of Object.entries(columns)) {
        const text = cellText(cells[index]);
        if (text !== "") values[field] = text;
      }
      if (Object.keys(values).length) rows.push({ row: firstRow + headerIndex + offset + 2, values });
    });
    totalRows += rows.length;
    if (totalRows > MAX_ROWS) throw new AppError(`The file has more than ${MAX_ROWS.toLocaleString("en")} rows. Split it into smaller files.`);
    sheets.push({ name, kind, missing, rows });
  }
  return { sheets, ignored };
};

// ---------------------------------------------------------------------------
// Working out what the file changes
// ---------------------------------------------------------------------------

type Id = Types.ObjectId;
type RoomRecord = { _id: Id; code: string; building?: string | null; capacity: number; isComputerized: boolean; roomType: string; active: boolean };
type LecturerRecord = { _id: Id; name: string; email: string; staffNumber?: string | null };
type ModuleRecord = { _id: Id; code: string; name: string; lecturer: Id; requiresComputers: boolean; sessionsPerWeek: number; durationHours: number; credits: number; batches: number; preferredRoomType: string; specificRequirements: string; students: Id[] };
type StudentRecord = { _id: Id; studentId: string };

export type ImportExisting = { rooms: RoomRecord[]; lecturers: LecturerRecord[]; modules: ModuleRecord[]; students: StudentRecord[] };
export type ImportIssue = { sheet: string; row?: number; message: string };
export type ImportTally = { sheet: string; kind: ImportKind; rows: number; added: number; updated: number; unchanged: number; skipped: number };
type Changes<T> = { insert: T[]; update: Array<{ _id: Id; changes: Partial<T> }> };

export type ImportPlan = {
  tallies: ImportTally[];
  issues: ImportIssue[];
  rooms: Changes<Omit<RoomRecord, "building" | "roomType"> & { building: string; roomType: string }>;
  lecturers: Changes<Omit<LecturerRecord, "staffNumber"> & { staffNumber: string }>;
  modules: Changes<Omit<ModuleRecord, "students">>;
  enrolments: Map<string, Id[]>;
};

const yesNo = (value: string | undefined, label: string, current: boolean | undefined, fallback: boolean) => {
  if (value === undefined) return current ?? fallback;
  const answer = normalize(value);
  if (["yes", "y", "true", "1", "x"].includes(answer)) return true;
  if (["no", "n", "false", "0"].includes(answer)) return false;
  throw new AppError(`${label} must be Yes or No, not "${value}"`);
};

const changedFields = <T extends Record<string, unknown>>(current: Record<string, unknown>, next: T): Partial<T> => {
  const changes: Partial<T> = {};
  for (const key of Object.keys(next) as Array<keyof T>) {
    if (String(current[key as string] ?? "") !== String(next[key] ?? "")) changes[key] = next[key];
  }
  return changes;
};

// Adds, updates or leaves alone one record per row, matched on `key`. Rows that break a rule are skipped.
const planRecords = <Saved extends { _id: Id }, Fields extends Record<string, unknown>>(params: {
  sheets: ImportSheet[];
  issues: ImportIssue[];
  tallies: ImportTally[];
  noun: string;
  existing: Map<string, Saved>;
  keyOf: (row: ImportRow) => string | undefined;
  missingKey: string;
  build: (row: ImportRow, current: Saved | undefined) => Fields;
  changes: Changes<Fields & { _id: Id }>;
}) => {
  const seen = new Map<string, string>();
  const saved = new Map<string, Fields & { _id: Id }>();
  for (const sheet of params.sheets) {
    const tally: ImportTally = { sheet: sheet.name, kind: sheet.kind, rows: sheet.rows.length, added: 0, updated: 0, unchanged: 0, skipped: 0 };
    params.tallies.push(tally);
    if (sheet.missing.length) {
      params.issues.push({ sheet: sheet.name, message: `Needs a ${sheet.missing.join(" and a ")} column, so none of its rows were read` });
      tally.skipped = sheet.rows.length;
      continue;
    }
    for (const row of sheet.rows) {
      const skip = (message: string) => {
        params.issues.push({ sheet: sheet.name, row: row.row, message });
        tally.skipped += 1;
      };
      const key = params.keyOf(row);
      if (!key) {
        skip(`${params.missingKey} is blank`);
        continue;
      }
      const earlier = seen.get(key);
      if (earlier) {
        skip(`${params.noun} ${key} is already on ${earlier}`);
        continue;
      }
      const current = params.existing.get(key);
      let fields: Fields;
      try {
        fields = params.build(row, current);
      } catch (error) {
        if (!(error instanceof AppError)) throw error;
        skip(`${params.noun} ${key}: ${error.message}`);
        continue;
      }
      seen.set(key, `${sheet.name} row ${row.row}`);
      if (!current) {
        const record = { ...fields, _id: new Types.ObjectId() };
        params.changes.insert.push(record);
        saved.set(key, record);
        tally.added += 1;
        continue;
      }
      const changes = changedFields(current as Record<string, unknown>, fields);
      saved.set(key, { ...fields, _id: current._id });
      if (Object.keys(changes).length) {
        params.changes.update.push({ _id: current._id, changes: changes as Partial<Fields & { _id: Id }> });
        tally.updated += 1;
      } else {
        tally.unchanged += 1;
      }
    }
  }
  return saved;
};

export const planImport = (sheets: ImportSheet[], existing: ImportExisting, term: Term): ImportPlan => {
  const plan: ImportPlan = {
    tallies: [],
    issues: [],
    rooms: { insert: [], update: [] },
    lecturers: { insert: [], update: [] },
    modules: { insert: [], update: [] },
    enrolments: new Map(),
  };
  const sheetsOf = (kind: ImportKind) => sheets.filter((sheet) => sheet.kind === kind);
  const termLabel = `${term.academicYear} semester ${term.semester}`;

  planRecords({
    issues: plan.issues,
    tallies: plan.tallies,
    sheets: sheetsOf("rooms"),
    noun: "Room",
    missingKey: "Room code",
    existing: new Map(existing.rooms.map((room) => [room.code, room])),
    keyOf: (row) => row.values.code?.toUpperCase(),
    build: (row, current) => roomInput({
      code: row.values.code,
      building: row.values.building ?? current?.building ?? "",
      capacity: row.values.capacity ?? current?.capacity,
      isComputerized: yesNo(row.values.isComputerized, "Computer lab", current?.isComputerized, false),
      roomType: row.values.roomType ?? current?.roomType ?? "30-seater",
      active: yesNo(row.values.active, "In use", current?.active, true),
    }),
    changes: plan.rooms,
  });

  // Every lecturer a module can name: the ones already added, as this file leaves them
  const lecturers = new Map(existing.lecturers.map((lecturer) => [lecturer.email, { _id: lecturer._id, name: lecturer.name, email: lecturer.email }]));
  const fileLecturers = planRecords({
    issues: plan.issues,
    tallies: plan.tallies,
    sheets: sheetsOf("lecturers"),
    noun: "Lecturer",
    missingKey: "Email",
    existing: new Map(existing.lecturers.map((lecturer) => [lecturer.email, lecturer])),
    keyOf: (row) => row.values.email?.toLowerCase(),
    build: (row, current) => lecturerInput({
      name: row.values.name ?? current?.name,
      email: row.values.email,
      staffNumber: row.values.staffNumber ?? current?.staffNumber ?? "",
    }),
    changes: plan.lecturers,
  });
  for (const [email, lecturer] of fileLecturers) lecturers.set(email, lecturer);

  const lecturerFor = (value: string) => {
    if (value.includes("@")) {
      const lecturer = lecturers.get(value.toLowerCase());
      if (!lecturer) throw new AppError(`no lecturer has the email ${value}. Add them on the Lecturers sheet first`);
      return lecturer._id;
    }
    const named = [...lecturers.values()].filter((lecturer) => normalize(lecturer.name) === normalize(value));
    if (named.length > 1) throw new AppError(`more than one lecturer is called ${value}, so use their email instead`);
    if (!named[0]) throw new AppError(`no lecturer is called ${value}. Add them on the Lecturers sheet first`);
    return named[0]._id;
  };

  const modules = planRecords({
    issues: plan.issues,
    tallies: plan.tallies,
    sheets: sheetsOf("modules"),
    noun: "Module",
    missingKey: "Module code",
    existing: new Map(existing.modules.map((module) => [module.code, module])),
    keyOf: (row) => row.values.code?.toUpperCase(),
    build: (row, current) => {
      const fields = moduleFields({
        code: row.values.code,
        name: row.values.name ?? current?.name,
        requiresComputers: yesNo(row.values.requiresComputers, "Computer lab", current?.requiresComputers, false),
        sessionsPerWeek: row.values.sessionsPerWeek ?? current?.sessionsPerWeek ?? NEW_MODULE_DEFAULTS.sessionsPerWeek,
        durationHours: row.values.durationHours ?? current?.durationHours ?? NEW_MODULE_DEFAULTS.durationHours,
        credits: row.values.credits ?? current?.credits ?? 10,
        batches: row.values.batches ?? current?.batches ?? 1,
        preferredRoomType: row.values.preferredRoomType ?? current?.preferredRoomType ?? "any",
        specificRequirements: row.values.specificRequirements ?? current?.specificRequirements ?? "",
      });
      const lecturer = row.values.lecturer ? lecturerFor(row.values.lecturer) : current?.lecturer;
      if (!lecturer) throw new AppError("Lecturer email is blank");
      return { ...fields, lecturer };
    },
    changes: plan.modules,
  });

  // Enrolments can be for any module in the term, whether or not it is in this file
  const enrolled = new Map<string, Set<string>>();
  const moduleIds = new Map<string, Id>();
  for (const module of existing.modules) {
    moduleIds.set(module.code, module._id);
    enrolled.set(String(module._id), new Set(module.students.map(String)));
  }
  for (const [code, module] of modules) {
    moduleIds.set(code, module._id);
    if (!enrolled.has(String(module._id))) enrolled.set(String(module._id), new Set());
  }
  const students = new Map(existing.students.map((student) => [student.studentId, student._id]));

  for (const sheet of sheetsOf("enrolments")) {
    const tally: ImportTally = { sheet: sheet.name, kind: "enrolments", rows: sheet.rows.length, added: 0, updated: 0, unchanged: 0, skipped: 0 };
    plan.tallies.push(tally);
    if (sheet.missing.length) {
      plan.issues.push({ sheet: sheet.name, message: `Needs a ${sheet.missing.join(" and a ")} column, so none of its rows were read` });
      tally.skipped = sheet.rows.length;
      continue;
    }
    for (const row of sheet.rows) {
      const skip = (message: string) => {
        plan.issues.push({ sheet: sheet.name, row: row.row, message });
        tally.skipped += 1;
      };
      const code = row.values.module?.toUpperCase();
      const number = row.values.studentId;
      if (!code) { skip("Module code is blank"); continue; }
      if (!number) { skip("Student number is blank"); continue; }
      const moduleId = moduleIds.get(code);
      if (!moduleId) { skip(`Module ${code} isn't in ${termLabel}. Add it on the Modules sheet first`); continue; }
      const studentId = students.get(number);
      if (!studentId) { skip(`Student ${number} isn't in the Student Registry`); continue; }
      const current = enrolled.get(String(moduleId))!;
      if (current.has(String(studentId))) { tally.unchanged += 1; continue; }
      current.add(String(studentId));
      plan.enrolments.set(String(moduleId), [...(plan.enrolments.get(String(moduleId)) ?? []), studentId]);
      tally.added += 1;
    }
  }

  return plan;
};

// ---------------------------------------------------------------------------
// Preview and import
// ---------------------------------------------------------------------------

export const importRecord = (actor: Actor, institution: Id, term: Term, fileName: string | undefined, changes: number, sheets: ImportTally[]) => ({
  institution,
  ...term,
  fileName: (fileName || "spreadsheet").slice(0, 255),
  ...(Types.ObjectId.isValid(String(actor._id)) ? { importedBy: new Types.ObjectId(String(actor._id)) } : {}),
  ...(actor.email ? { importedByEmail: actor.email } : {}),
  changes,
  sheets,
});

export type LatestImport = { importedAt: Date; importedByEmail: string | null; fileName: string; changes: number };

// The most recent import into a term, so Registry can be warned before importing into it again
export const latestImport = async (actor: Actor, input: Record<string, any>): Promise<LatestImport | null> => {
  const term = termOf(input);
  const found = await TimetablingImport.findOne({ institution: institutionOf(actor), ...term })
    .sort({ createdAt: -1 })
    .select("createdAt importedByEmail fileName changes")
    .lean();
  return found ? { importedAt: found.createdAt!, importedByEmail: found.importedByEmail ?? null, fileName: found.fileName, changes: found.changes } : null;
};

export const importTimetablingData = async (
  actor: Actor,
  file: { buffer: Buffer; originalname?: string } | undefined,
  input: Record<string, any>,
) => {
  if (!file?.buffer?.length) throw new AppError("Choose a spreadsheet to upload");
  const term = termOf(input);
  const apply = flag(input.apply);
  const institution = institutionOf(actor);

  const { sheets, ignored } = parseWorkbook(file.buffer);
  if (!sheets.length) {
    throw new AppError("No Rooms, Lecturers, Modules or Enrolments sheet was found in the file. Download the template to see the columns.");
  }

  const studentNumbers = [...new Set(sheets.filter((sheet) => sheet.kind === "enrolments").flatMap((sheet) => sheet.rows.map((row) => row.values.studentId)).filter((value): value is string => Boolean(value)))];
  const [rooms, lecturers, modules, students] = await Promise.all([
    Room.find({ institution }).select("code building capacity isComputerized roomType active").lean(),
    Lecturer.find({ institution }).select("name email staffNumber").lean(),
    CourseModule.find({ institution, ...term }).select("code name lecturer requiresComputers sessionsPerWeek durationHours credits batches preferredRoomType specificRequirements students").lean(),
    studentNumbers.length ? Student.find({ institution, studentId: { $in: studentNumbers } }).select("studentId").lean() : [],
  ]);
  const plan = planImport(sheets, { rooms, lecturers, modules, students }, term);
  const changes = plan.tallies.reduce((total, tally) => total + tally.added + tally.updated, 0);

  if (apply && changes) {
    try {
      await withOptionalTransaction(async (session) => {
        const options = session ? { session } : {};
        const writes = <T>(changeSet: Changes<T>, extra: Record<string, unknown> = {}) => [
          ...changeSet.insert.map((document) => ({ insertOne: { document: { ...document, ...extra, institution } } })),
          ...changeSet.update.map(({ _id, changes: set }) => ({ updateOne: { filter: { _id, institution }, update: { $set: set } } })),
        ];
        // Lecturers before modules, and modules before enrolments, so nothing points at a record not yet saved
        if (plan.rooms.insert.length || plan.rooms.update.length) await Room.bulkWrite(writes(plan.rooms) as any, options);
        if (plan.lecturers.insert.length || plan.lecturers.update.length) await Lecturer.bulkWrite(writes(plan.lecturers) as any, options);
        if (plan.modules.insert.length || plan.modules.update.length) await CourseModule.bulkWrite(writes(plan.modules, { ...term, students: [] }) as any, options);
        if (plan.enrolments.size) {
          await CourseModule.bulkWrite([...plan.enrolments].map(([moduleId, studentIds]) => ({
            updateOne: { filter: { _id: new Types.ObjectId(moduleId), institution }, update: { $addToSet: { students: { $each: studentIds } } } },
          })), options);
        }
        // Recorded with the changes, so the history never lists an import that didn't happen
        await TimetablingImport.create([importRecord(actor, institution, term, file.originalname, changes, plan.tallies)], options);
      });
    } catch (error) {
      if (isDuplicateKey(error)) {
        throw new AppError("Someone else added some of the same rooms, lecturers or modules while you were importing. Upload the file again to see the latest preview.", 409);
      }
      throw error;
    }
    await audit(actor, "timetabling.imported", "Institution", institution, {
      fileName: file.originalname,
      ...term,
      sheets: plan.tallies,
      skippedRows: plan.issues.length,
    });
  }

  return {
    applied: apply && changes > 0,
    term,
    changes,
    sheets: plan.tallies,
    issues: plan.issues.slice(0, MAX_ISSUES_SHOWN),
    issueCount: plan.issues.length,
    ignoredSheets: ignored,
  };
};

// ---------------------------------------------------------------------------
// Template
// ---------------------------------------------------------------------------

export const buildImportTemplate = (): Buffer => {
  const workbook = XLSX.utils.book_new();
  const instructions: string[][] = [
    ["How to fill in this workbook"],
    [],
    ["Fill in the sheets you need and leave the others empty. Keep each sheet's first row as it is."],
    ["Rooms are matched by room code, lecturers by email and modules by module code. A match is updated from the file, and a blank cell keeps what is there now."],
    ["Nothing is deleted, and students are only ever added to modules."],
    ["Modules and enrolments go into the academic year and semester you choose when you upload."],
    ["You'll see what the file will change before anything is saved."],
    [],
    ["Sheet", "Column", "What to enter"],
    ...KINDS.flatMap((kind) => Object.values(COLUMNS[kind]).map((column) => [SHEET_TITLES[kind], column.label, column.help])),
  ];
  const notes = XLSX.utils.aoa_to_sheet(instructions);
  notes["!cols"] = [{ wch: 14 }, { wch: 18 }, { wch: 110 }];
  XLSX.utils.book_append_sheet(workbook, notes, "Instructions");

  for (const kind of KINDS) {
    const labels = Object.values(COLUMNS[kind]).map((column) => column.label);
    const sheet = XLSX.utils.aoa_to_sheet([labels]);
    sheet["!cols"] = labels.map((label) => ({ wch: Math.max(16, label.length + 4) }));
    XLSX.utils.book_append_sheet(workbook, sheet, SHEET_TITLES[kind]);
  }
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
};

// ---------------------------------------------------------------------------
// One sample CSV per tab, and the column guide shown beside it
// ---------------------------------------------------------------------------

// Enrolments come from another platform, so only these three have a sample
export const SAMPLE_KINDS = ["rooms", "lecturers", "modules"] as const;
export type SampleKind = (typeof SAMPLE_KINDS)[number];

export const isSampleKind = (value: unknown): value is SampleKind => SAMPLE_KINDS.includes(value as SampleKind);

export type ColumnStatus = "required" | "requiredForNew" | "optional";
export type ColumnGuide = { label: string; status: ColumnStatus; help: string; example: string };

// The columns of each sample, in the order they appear in the file
export const importColumns = (): Record<SampleKind, ColumnGuide[]> =>
  Object.fromEntries(SAMPLE_KINDS.map((kind) => [
    kind,
    Object.values(COLUMNS[kind]).map(({ label, required, requiredForNew, help, example }) => ({
      label,
      status: required ? "required" : requiredForNew ? "requiredForNew" : "optional",
      help,
      example,
    })),
  ])) as Record<SampleKind, ColumnGuide[]>;

// The header row only, so nothing made up can be imported by mistake. The byte order mark makes
// Excel open the file as UTF-8.
export const buildSampleCsv = (kind: SampleKind): Buffer => {
  const labels = Object.values(COLUMNS[kind]).map((column) => column.label);
  return Buffer.from(`﻿${XLSX.utils.sheet_to_csv(XLSX.utils.aoa_to_sheet([labels]))}\r\n`, "utf8");
};
