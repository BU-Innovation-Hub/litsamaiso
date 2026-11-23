import assert from "node:assert/strict";
import test from "node:test";
import { Types } from "mongoose";
import XLSX from "xlsx";
import { readFileSync } from "node:fs";
import {
  buildImportTemplate,
  buildSampleCsv,
  importColumns,
  importRecord,
  isSampleKind,
  parseWorkbook,
  planImport,
  SAMPLE_KINDS,
  type ImportExisting,
} from "./timetablingImportService.js";
import { moduleFields } from "./timetablingService.js";

const term = { academicYear: "2026/2027", semester: 1 };

const workbook = (sheets: Record<string, unknown[][]>) => {
  const book = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), name);
  return XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
};

const nothing = (): ImportExisting => ({ rooms: [], lecturers: [], modules: [], students: [] });

const plan = (sheets: Record<string, unknown[][]>, existing: ImportExisting = nothing()) =>
  planImport(parseWorkbook(workbook(sheets)).sheets, existing, term);

const tally = (result: ReturnType<typeof plan>, sheet: string) => result.tallies.find((entry) => entry.sheet === sheet);

test("the template's own sheets and columns are all recognised", () => {
  const { sheets, ignored } = parseWorkbook(buildImportTemplate());
  assert.deepEqual(sheets.map((sheet) => sheet.kind), ["rooms", "lecturers", "modules", "enrolments"]);
  assert.ok(sheets.every((sheet) => sheet.missing.length === 0 && sheet.rows.length === 0));
  assert.deepEqual(ignored, [], "the Instructions sheet is skipped quietly");
});

test("a sheet Registry already keeps is read as it is, title row and all", () => {
  const { sheets } = parseWorkbook(workbook({
    "Venues 2026": [
      ["Lecture venues for 2026"],
      [],
      ["Room", "Seats", "Computers", "Block"],
      ["a101", 60, "No", "Block A"],
      [],
      ["LAB1", 40, "yes", ""],
    ],
  }));
  assert.equal(sheets.length, 1);
  assert.equal(sheets[0]!.kind, "rooms");
  assert.deepEqual(sheets[0]!.rows, [
    { row: 4, values: { code: "a101", capacity: "60", isComputerized: "No", building: "Block A" } },
    { row: 6, values: { code: "LAB1", capacity: "40", isComputerized: "yes" } },
  ]);
});

test("a CSV is recognised by its columns and keeps leading zeros", () => {
  const { sheets } = parseWorkbook(Buffer.from("Module code,Student number\nCSC101,0012\n"));
  assert.equal(sheets[0]!.kind, "enrolments");
  assert.deepEqual(sheets[0]!.rows[0]!.values, { module: "CSC101", studentId: "0012" });
});

test("sheets that aren't recognised are listed, not guessed", () => {
  const { sheets, ignored } = parseWorkbook(workbook({ Budget: [["Item", "Amount"], ["Chairs", 300]], Rooms: [["Room code", "Capacity"], ["A1", 10]] }));
  assert.deepEqual(ignored, ["Budget"]);
  assert.equal(sheets.length, 1);
});

test("rooms are added, updated or left alone, and a blank cell keeps what is there", () => {
  const existing = nothing();
  const a101 = new Types.ObjectId();
  existing.rooms.push({ _id: a101, code: "A101", building: "Block A", capacity: 40, isComputerized: false, roomType: "30-seater", active: false });
  existing.rooms.push({ _id: new Types.ObjectId(), code: "A102", building: "Block A", capacity: 30, isComputerized: false, roomType: "30-seater", active: true });
  const result = plan({
    Rooms: [
      ["Room code", "Building", "Capacity", "Computer lab", "In use"],
      ["a101", "", 60, "", ""],
      ["A102", "Block A", 30, "No", "Yes"],
      ["LAB1", "Labs", 40, "Yes", ""],
    ],
  }, existing);
  assert.deepEqual(tally(result, "Rooms"), { sheet: "Rooms", kind: "rooms", rows: 3, added: 1, updated: 1, unchanged: 1, skipped: 0 });
  assert.deepEqual(result.rooms.update, [{ _id: a101, changes: { capacity: 60 } }], "only the capacity changes; In use stays No");
  assert.equal(result.rooms.insert[0]!.code, "LAB1");
  assert.equal(result.rooms.insert[0]!.isComputerized, true);
  assert.equal(result.rooms.insert[0]!.active, true, "a new room is in use unless the file says otherwise");
});

test("rows that break a rule are skipped with the reason and the row number", () => {
  const result = plan({
    Rooms: [
      ["Room code", "Capacity", "Computer lab"],
      ["A101", 60, "No"],
      ["A101", 70, "No"],
      ["A102", "lots", "No"],
      ["A103", 20, "maybe"],
      ["", 20, "No"],
    ],
  });
  assert.equal(tally(result, "Rooms")!.added, 1);
  assert.deepEqual(result.issues, [
    { sheet: "Rooms", row: 3, message: "Room A101 is already on Rooms row 2" },
    { sheet: "Rooms", row: 4, message: "Room A102: Capacity must be a whole number from 1 to 2000" },
    { sheet: "Rooms", row: 5, message: 'Room A103: Computer lab must be Yes or No, not "maybe"' },
    { sheet: "Rooms", row: 6, message: "Room code is blank" },
  ]);
});

test("a sheet without a required column is reported and none of it is read", () => {
  const result = plan({ Rooms: [["Room code", "Building"], ["A101", "Block A"]] });
  assert.equal(result.rooms.insert.length, 0);
  assert.deepEqual(result.issues, [{ sheet: "Rooms", message: "Needs a Capacity column, so none of its rows were read" }]);
  assert.equal(tally(result, "Rooms")!.skipped, 1);
});

test("modules find their lecturer by email or name, including lecturers added in the same file", () => {
  const existing = nothing();
  const dube = new Types.ObjectId();
  existing.lecturers.push({ _id: dube, name: "Ms Ann Dube", email: "ann.dube@example.com" });
  existing.lecturers.push({ _id: new Types.ObjectId(), name: "Mr Sam Moyo", email: "sam.moyo@example.com" });
  existing.lecturers.push({ _id: new Types.ObjectId(), name: "Mr Sam Moyo", email: "s.moyo@example.com" });
  const result = plan({
    Lecturers: [["Name", "Email"], ["Dr New Person", "New.Person@Example.com"]],
    Modules: [
      ["Module code", "Module name", "Lecturer email", "Classes per week", "Hours per class", "Computer lab"],
      ["CSC101", "Programming", "new.person@example.com", 2, 2, "Yes"],
      ["CSC102", "Fundamentals", "ms ann dube", "", "", ""],
      ["CSC103", "Maths", "Mr Sam Moyo", 1, 1, "No"],
      ["CSC104", "Networks", "nobody@example.com", 1, 1, "No"],
      ["CSC105", "Ethics", "", 1, 1, "No"],
      ["CSC106", "Too many", "ann.dube@example.com", 9, 1, "No"],
    ],
  }, existing);
  const newPerson = result.lecturers.insert[0]!;
  assert.equal(newPerson.email, "new.person@example.com");
  const [csc101, csc102] = result.modules.insert;
  assert.equal(String(csc101!.lecturer), String(newPerson._id));
  assert.equal(csc101!.requiresComputers, true);
  assert.equal(String(csc102!.lecturer), String(dube));
  assert.equal(csc102!.sessionsPerWeek, 2, "blank means the Add module form's default");
  assert.equal(csc102!.durationHours, 2);
  assert.deepEqual(result.issues.map((issue) => `${issue.row}: ${issue.message}`), [
    "4: Module CSC103: more than one lecturer is called Mr Sam Moyo, so use their email instead",
    "5: Module CSC104: no lecturer has the email nobody@example.com. Add them on the Lecturers sheet first",
    "6: Module CSC105: Lecturer email is blank",
    "7: Module CSC106: Classes per week must be a whole number from 1 to 5",
  ]);
});

test("updating a module changes only what the file changes", () => {
  const existing = nothing();
  const lecturer = new Types.ObjectId();
  const module = new Types.ObjectId();
  existing.lecturers.push({ _id: lecturer, name: "Ms Ann Dube", email: "ann.dube@example.com" });
  existing.modules.push({ _id: module, code: "CSC101", name: "Programming", lecturer, requiresComputers: true, sessionsPerWeek: 2, durationHours: 2, credits: 10, batches: 1, preferredRoomType: "any", specificRequirements: "", students: [] });
  const result = plan({ Modules: [["Module code", "Module name", "Lecturer email", "Hours per class"], ["CSC101", "", "", 3]] }, existing);
  assert.deepEqual(result.modules.update, [{ _id: module, changes: { durationHours: 3 } }]);
});

test("enrolments add students once, to modules in the file or already in the term", () => {
  const existing = nothing();
  const lecturer = new Types.ObjectId();
  const csc101 = new Types.ObjectId();
  const [thato, lerato, neo] = [new Types.ObjectId(), new Types.ObjectId(), new Types.ObjectId()];
  existing.lecturers.push({ _id: lecturer, name: "Ms Ann Dube", email: "ann.dube@example.com" });
  existing.modules.push({ _id: csc101, code: "CSC101", name: "Programming", lecturer, requiresComputers: false, sessionsPerWeek: 2, durationHours: 2, credits: 10, batches: 1, preferredRoomType: "any", specificRequirements: "", students: [thato] });
  existing.students.push({ _id: thato, studentId: "2001" }, { _id: lerato, studentId: "2002" }, { _id: neo, studentId: "2003" });
  const result = plan({
    Modules: [["Module code", "Module name", "Lecturer email"], ["CSC102", "Fundamentals", "ann.dube@example.com"]],
    Enrolments: [
      ["Module code", "Student number"],
      ["csc101", "2001"],
      ["CSC101", "2002"],
      ["CSC101", "2002"],
      ["CSC102", "2003"],
      ["CSC999", "2003"],
      ["CSC102", "9999"],
    ],
  }, existing);
  const csc102 = result.modules.insert[0]!;
  assert.deepEqual([...result.enrolments].map(([id, students]) => [id, students.map(String)]), [
    [String(csc101), [String(lerato)]],
    [String(csc102._id), [String(neo)]],
  ]);
  assert.deepEqual(tally(result, "Enrolments"), { sheet: "Enrolments", kind: "enrolments", rows: 6, added: 2, updated: 0, unchanged: 2, skipped: 2 });
  assert.deepEqual(result.issues.map((issue) => issue.message), [
    "Module CSC999 isn't in 2026/2027 semester 1. Add it on the Modules sheet first",
    "Student 9999 isn't in the Student Registry",
  ]);
});

// ---------------------------------------------------------------------------
// Per-tab sample CSVs and the column guide
// ---------------------------------------------------------------------------

test("each tab's sample CSV is just its header row, and is read back as that tab", () => {
  for (const kind of SAMPLE_KINDS) {
    const csv = buildSampleCsv(kind);
    assert.ok(csv.toString("utf8").startsWith("﻿"), `${kind} sample starts with a byte order mark for Excel`);
    const { sheets, ignored } = parseWorkbook(csv);
    assert.deepEqual(ignored, []);
    assert.equal(sheets.length, 1);
    assert.equal(sheets[0]!.kind, kind);
    assert.deepEqual(sheets[0]!.missing, []);
    assert.deepEqual(sheets[0]!.rows, [], "no example data that could be imported by mistake");
  }
});

test("the column guide lists the sample's columns in the file's order", () => {
  const guide = importColumns();
  assert.deepEqual(Object.keys(guide), [...SAMPLE_KINDS]);
  for (const kind of SAMPLE_KINDS) {
    const header = buildSampleCsv(kind).toString("utf8").replace(/^﻿/, "").trim().split(",");
    assert.deepEqual(guide[kind].map((column) => column.label), header);
    assert.ok(guide[kind].every((column) => column.help && column.example), `${kind} columns all have help and an example`);
  }
  assert.deepEqual(guide.rooms.filter((column) => column.status === "required").map((column) => column.label), ["Room code", "Capacity"]);
  assert.deepEqual(guide.lecturers.filter((column) => column.status === "required").map((column) => column.label), ["Name", "Email"]);
  assert.deepEqual(guide.modules.filter((column) => column.status !== "optional").map((column) => [column.label, column.status]), [
    ["Module code", "required"],
    ["Module name", "requiredForNew"],
    ["Lecturer email", "requiredForNew"],
  ]);
});

test("only rooms, lecturers and modules have a sample", () => {
  assert.ok(isSampleKind("rooms") && isSampleKind("lecturers") && isSampleKind("modules"));
  for (const kind of ["enrolments", "ROOMS", "../rooms", "", undefined]) assert.equal(isSampleKind(kind), false);
});

// ---------------------------------------------------------------------------
// The test data in docs/sample-data/room-allocation, so it keeps importing as described
// ---------------------------------------------------------------------------

const sampleData = new URL("../../../docs/sample-data/room-allocation/", import.meta.url);
const planSampleData = (set: "valid" | "with-errors") =>
  planImport(SAMPLE_KINDS.flatMap((kind) => parseWorkbook(readFileSync(new URL(`${set}/${kind}.csv`, sampleData))).sheets), nothing(), term);

test("the valid test data imports in full", () => {
  const result = planSampleData("valid");
  assert.deepEqual(result.issues, []);
  assert.deepEqual(result.tallies.map(({ kind, added, skipped }) => [kind, added, skipped]), [["rooms", 14, 0], ["lecturers", 10, 0], ["modules", 18, 0]]);
  assert.ok(result.lecturers.insert.some((lecturer) => lecturer.staffNumber === "BU0042"));
  assert.equal(result.modules.insert.find((module) => module.code === "CSC305")?.specificRequirements, "Projector, whiteboard");
  const named = result.modules.insert.find((module) => module.code === "NET220");
  const palesa = result.lecturers.insert.find((lecturer) => lecturer.email === "palesa.nthako@botho.example");
  assert.equal(String(named?.lecturer), String(palesa?._id), "a lecturer can be given by name");
  assert.equal(result.rooms.insert.find((room) => room.code === "A104")?.active, false);
});

test("the test data with errors is skipped row by row, with the reason", () => {
  const result = planSampleData("with-errors");
  assert.deepEqual(result.tallies.map(({ kind, added, skipped }) => [kind, added, skipped]), [["rooms", 1, 7], ["lecturers", 1, 4], ["modules", 1, 10]]);
  assert.deepEqual(result.issues.map(({ row, message }) => [row, message]), [
    [3, "Room D102: Capacity must be a whole number from 1 to 2000"],
    [4, "Room D103: Capacity must be a whole number from 1 to 2000"],
    [5, "Room D104: Capacity must be a whole number from 1 to 2000"],
    [6, 'Room D105: Computer lab must be Yes or No, not "maybe"'],
    [7, "Room D101 is already on Sheet1 row 2"],
    [8, "Room code is blank"],
    [9, 'Room D106: In use must be Yes or No, not "sometimes"'],
    [3, "Lecturer sello.thamae.botho.example: Enter a valid email address"],
    [4, "Email is blank"],
    [5, "Lecturer puleng.makara@botho.example is already on Sheet1 row 2"],
    [6, "Lecturer neo.tau@botho.example: Name is required"],
    [3, "Module DEV120: no lecturer has the email neo.tau@botho.example. Add them on the Lecturers sheet first"],
    [4, "Module DEV130: no lecturer has the email nobody@botho.example. Add them on the Lecturers sheet first"],
    [5, "Module DEV140: no lecturer is called Thato Unknown. Add them on the Lecturers sheet first"],
    [6, "Module DEV150: Classes per week must be a whole number from 1 to 5"],
    [7, "Module DEV160: Hours per class must be a whole number from 1 to 4"],
    [8, "Module DEV170: Credits must be a whole number from 1 to 100"],
    [9, "Module DEV180: Lecturer email is blank"],
    [10, "Module DEV110 is already on Sheet1 row 2"],
    [11, "Module DEV190: Module name is required"],
    [12, 'Module DEV195: Computer lab must be Yes or No, not "perhaps"'],
  ]);
});

// ---------------------------------------------------------------------------
// The Add module form doesn't send credits or batches
// ---------------------------------------------------------------------------

test("a module without credits or batches gets the defaults, but a wrong value is still refused", () => {
  const form = { code: "csc101", name: "Introduction to Programming", sessionsPerWeek: 2, durationHours: 2, requiresComputers: true };
  const fields = moduleFields(form);
  assert.equal(fields.credits, 10);
  assert.equal(fields.batches, 1);
  assert.equal(fields.preferredRoomType, "any");
  assert.equal(moduleFields({ ...form, credits: "", batches: null }).credits, 10);
  assert.equal(moduleFields({ ...form, credits: 15, batches: 2 }).batches, 2);
  assert.throws(() => moduleFields({ ...form, credits: 0 }), /Credits must be a whole number from 1 to 100/);
  assert.throws(() => moduleFields({ ...form, batches: "two" }), /Batches must be a whole number from 1 to 20/);
});

// ---------------------------------------------------------------------------
// Import history
// ---------------------------------------------------------------------------

test("an import is recorded against its term, by whoever made it", () => {
  const institution = new Types.ObjectId();
  const actorId = new Types.ObjectId();
  const sheets = [{ sheet: "Sheet1", kind: "rooms" as const, rows: 2, added: 2, updated: 0, unchanged: 0, skipped: 0 }];
  const record = importRecord({ _id: actorId, email: "registry@botho.example", institution }, institution, term, "rooms.csv", 2, sheets);
  assert.deepEqual(record, { institution, ...term, fileName: "rooms.csv", importedBy: actorId, importedByEmail: "registry@botho.example", changes: 2, sheets });
  const unnamed = importRecord({ _id: "script", institution }, institution, term, undefined, 1, []);
  assert.equal(unnamed.fileName, "spreadsheet");
  assert.ok(!("importedBy" in unnamed) && !("importedByEmail" in unnamed));
});
