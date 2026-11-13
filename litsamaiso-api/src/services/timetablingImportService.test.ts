import assert from "node:assert/strict";
import test from "node:test";
import { Types } from "mongoose";
import XLSX from "xlsx";
import { buildImportTemplate, parseWorkbook, planImport, type ImportExisting } from "./timetablingImportService.js";

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
  existing.rooms.push({ _id: a101, code: "A101", building: "Block A", capacity: 40, isComputerized: false, active: false });
  existing.rooms.push({ _id: new Types.ObjectId(), code: "A102", building: "Block A", capacity: 30, isComputerized: false, active: true });
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
  existing.modules.push({ _id: module, code: "CSC101", name: "Programming", lecturer, requiresComputers: true, sessionsPerWeek: 2, durationHours: 2, students: [] });
  const result = plan({ Modules: [["Module code", "Module name", "Lecturer email", "Hours per class"], ["CSC101", "", "", 3]] }, existing);
  assert.deepEqual(result.modules.update, [{ _id: module, changes: { durationHours: 3 } }]);
});

test("enrolments add students once, to modules in the file or already in the term", () => {
  const existing = nothing();
  const lecturer = new Types.ObjectId();
  const csc101 = new Types.ObjectId();
  const [thato, lerato, neo] = [new Types.ObjectId(), new Types.ObjectId(), new Types.ObjectId()];
  existing.lecturers.push({ _id: lecturer, name: "Ms Ann Dube", email: "ann.dube@example.com" });
  existing.modules.push({ _id: csc101, code: "CSC101", name: "Programming", lecturer, requiresComputers: false, sessionsPerWeek: 2, durationHours: 2, students: [thato] });
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
