// Adds sample rooms, lecturers, modules and students for trying out Room Allocation.
//
// The modules form eight programme cohorts, with some modules shared between cohorts, so student clashes, the
// lecturer break and computer labs all come into play when Registry clicks Generate. One module (DSC290) needs
// a computer lab bigger than any there is, so there is always a class waiting to be placed.
//
// Everything it adds is marked so --remove can take it out again: rooms are in buildings named "Sample ...",
// lecturers and students have @timetable-sample.invalid emails (.invalid never receives mail), and student
// numbers start with TT. It only adds what is missing, so running it twice changes nothing, and records Registry
// made are never changed.
//
// It writes to MONGO_URI from .env. A database that isn't on this machine also needs --confirm-host=<host>.
//
//   npm run seed:timetabling
//   npm run seed:timetabling -- --institution "Botho University Lesotho" --year 2026/2027 --semester 1
//   npm run seed:timetabling -- --remove
import dotenv from "dotenv";
dotenv.config();

import mongoose, { Types } from "mongoose";
import { connectDatabase, getMongoUri } from "../config/database.js";
import { SEMESTERS } from "../constants/timetabling.js";
import { ClassSession } from "../models/ClassSession.js";
import { CourseModule } from "../models/CourseModule.js";
import { Institution } from "../models/Institution.js";
import { Lecturer } from "../models/Lecturer.js";
import { Role } from "../models/Role.js";
import { Room } from "../models/Room.js";
import { Student } from "../models/Student.js";
import { TimetableRun } from "../models/TimetableRun.js";
import { User } from "../models/User.js";
import { ACADEMIC_YEAR_MESSAGE, isAcademicYear } from "../utils/validation.js";

const SAMPLE_DOMAIN = "timetable-sample.invalid";
const SAMPLE_EMAIL = /@timetable-sample\.invalid$/;
const SAMPLE_BUILDING = /^Sample /;
const CASE_INSENSITIVE = { locale: "en", strength: 2 } as const;

const ROOMS = [
  { code: "HALL1", building: "Sample Main Hall", capacity: 200 },
  { code: "A101", building: "Sample Block A", capacity: 120 },
  { code: "A102", building: "Sample Block A", capacity: 90 },
  { code: "A103", building: "Sample Block A", capacity: 90 },
  { code: "A104", building: "Sample Block A", capacity: 60 },
  { code: "A105", building: "Sample Block A", capacity: 60 },
  { code: "A106", building: "Sample Block A", capacity: 45 },
  { code: "A107", building: "Sample Block A", capacity: 45 },
  { code: "A108", building: "Sample Block A", capacity: 30 },
  // Under renovation, so the generator should never use it
  { code: "A109", building: "Sample Block A", capacity: 60, active: false },
  { code: "B201", building: "Sample Block B", capacity: 80 },
  { code: "B202", building: "Sample Block B", capacity: 70 },
  { code: "B203", building: "Sample Block B", capacity: 50 },
  { code: "B204", building: "Sample Block B", capacity: 40 },
  { code: "LAB1", building: "Sample Computer Labs", capacity: 90, isComputerized: true },
  { code: "LAB2", building: "Sample Computer Labs", capacity: 90, isComputerized: true },
  { code: "LAB3", building: "Sample Computer Labs", capacity: 60, isComputerized: true },
  { code: "LAB4", building: "Sample Computer Labs", capacity: 40, isComputerized: true },
];

const LECTURERS = {
  mokoena: "Dr Thabo Mokoena",
  mohapi: "Ms Lineo Mohapi",
  letsie: "Mr Teboho Letsie",
  ntho: "Ms Palesa Ntho",
  ramakoae: "Dr Mpho Ramakoae",
  lerotholi: "Ms Nthabiseng Lerotholi",
  phafoli: "Mr Kabelo Phafoli",
  sekhesa: "Dr Limpho Sekhesa",
  makara: "Mr Tsepo Makara",
  khoali: "Ms Masechaba Khoali",
  thamae: "Mr Bokang Thamae",
  ralebese: "Mr Katleho Ralebese",
  // Teaches nothing yet, so he can be deleted
  sello: "Mr Tumelo Sello",
} as const;
type LecturerKey = keyof typeof LECTURERS;

const COHORTS = {
  cs1: { label: "BSc Computer Science year 1", size: 85 },
  cs2: { label: "BSc Computer Science year 2", size: 60 },
  is1: { label: "BSc Information Systems year 1", size: 70 },
  is2: { label: "BSc Information Systems year 2", size: 45 },
  acc1: { label: "BCom Accounting year 1", size: 90 },
  acc2: { label: "BCom Accounting year 2", size: 65 },
  bbm1: { label: "BA Business Management year 1", size: 75 },
  net1: { label: "Diploma in Network Engineering year 1", size: 35 },
} as const;
type CohortKey = keyof typeof COHORTS;

// Not in any module, for trying out pasting student numbers into one
const SPARE_STUDENTS = 20;

type ModuleSeed = {
  code: string;
  name: string;
  lecturer: LecturerKey;
  cohorts: CohortKey[];
  sessionsPerWeek: number;
  durationHours: number;
  requiresComputers?: boolean;
};

const MODULES: ModuleSeed[] = [
  { code: "CSC101", name: "Introduction to Programming", lecturer: "mokoena", cohorts: ["cs1"], sessionsPerWeek: 2, durationHours: 2, requiresComputers: true },
  { code: "CSC102", name: "Computer Fundamentals", lecturer: "mohapi", cohorts: ["cs1", "net1"], sessionsPerWeek: 2, durationHours: 2 },
  { code: "MTH111", name: "Discrete Mathematics", lecturer: "letsie", cohorts: ["cs1"], sessionsPerWeek: 3, durationHours: 1 },
  { code: "CSK101", name: "Communication Skills", lecturer: "ntho", cohorts: ["cs1", "is1"], sessionsPerWeek: 1, durationHours: 2 },
  { code: "CSC201", name: "Object-Oriented Programming", lecturer: "mokoena", cohorts: ["cs2"], sessionsPerWeek: 2, durationHours: 2, requiresComputers: true },
  { code: "CSC202", name: "Data Structures and Algorithms", lecturer: "mokoena", cohorts: ["cs2"], sessionsPerWeek: 2, durationHours: 2 },
  { code: "CSC203", name: "Operating Systems", lecturer: "mohapi", cohorts: ["cs2"], sessionsPerWeek: 2, durationHours: 2 },
  { code: "DBS201", name: "Database Systems", lecturer: "ramakoae", cohorts: ["cs2", "is2"], sessionsPerWeek: 2, durationHours: 2 },
  // 105 students and the biggest lab seats 90, so this one always waits to be placed
  { code: "DSC290", name: "Data Science Project", lecturer: "ramakoae", cohorts: ["cs2", "is2"], sessionsPerWeek: 1, durationHours: 3, requiresComputers: true },
  { code: "ISY101", name: "Introduction to Information Systems", lecturer: "lerotholi", cohorts: ["is1"], sessionsPerWeek: 2, durationHours: 2 },
  { code: "ISY102", name: "Spreadsheet Modelling", lecturer: "lerotholi", cohorts: ["is1"], sessionsPerWeek: 1, durationHours: 3, requiresComputers: true },
  { code: "MTH112", name: "Quantitative Methods", lecturer: "letsie", cohorts: ["is1"], sessionsPerWeek: 2, durationHours: 2 },
  { code: "ISY201", name: "Systems Analysis and Design", lecturer: "lerotholi", cohorts: ["is2"], sessionsPerWeek: 2, durationHours: 2 },
  { code: "WEB201", name: "Web Development", lecturer: "phafoli", cohorts: ["is2"], sessionsPerWeek: 2, durationHours: 2, requiresComputers: true },
  { code: "ACC101", name: "Financial Accounting I", lecturer: "sekhesa", cohorts: ["acc1"], sessionsPerWeek: 3, durationHours: 2 },
  { code: "MTH101", name: "Business Mathematics", lecturer: "letsie", cohorts: ["acc1", "bbm1"], sessionsPerWeek: 2, durationHours: 2 },
  { code: "ECO101", name: "Microeconomics", lecturer: "makara", cohorts: ["acc1", "bbm1"], sessionsPerWeek: 2, durationHours: 2 },
  { code: "CSK102", name: "Business Communication", lecturer: "ntho", cohorts: ["acc1", "bbm1"], sessionsPerWeek: 1, durationHours: 2 },
  { code: "ACC201", name: "Financial Accounting II", lecturer: "sekhesa", cohorts: ["acc2"], sessionsPerWeek: 2, durationHours: 2 },
  { code: "ACC202", name: "Cost Accounting", lecturer: "sekhesa", cohorts: ["acc2"], sessionsPerWeek: 2, durationHours: 2 },
  { code: "ACC203", name: "Computerised Accounting", lecturer: "khoali", cohorts: ["acc2"], sessionsPerWeek: 1, durationHours: 3, requiresComputers: true },
  { code: "TAX201", name: "Taxation", lecturer: "khoali", cohorts: ["acc2"], sessionsPerWeek: 2, durationHours: 2 },
  { code: "BBM101", name: "Principles of Management", lecturer: "thamae", cohorts: ["bbm1"], sessionsPerWeek: 2, durationHours: 2 },
  { code: "BBM102", name: "Marketing Fundamentals", lecturer: "thamae", cohorts: ["bbm1"], sessionsPerWeek: 2, durationHours: 2 },
  { code: "NET101", name: "Networking Fundamentals", lecturer: "ralebese", cohorts: ["net1"], sessionsPerWeek: 2, durationHours: 2, requiresComputers: true },
  { code: "NET102", name: "Computer Hardware", lecturer: "ralebese", cohorts: ["net1"], sessionsPerWeek: 2, durationHours: 2 },
  { code: "CSK103", name: "Technical Writing", lecturer: "ntho", cohorts: ["net1"], sessionsPerWeek: 1, durationHours: 2 },
];

const FIRST_NAMES = [
  "Thato", "Rethabile", "Lerato", "Tumelo", "Neo", "Karabo", "Mpho", "Palesa", "Teboho", "Lineo",
  "Kamohelo", "Relebohile", "Lehlohonolo", "Nthati", "Tsepang", "Bokang", "Reitumetse", "Mosa", "Lebohang", "Itumeleng",
  "Puleng", "Hlompho", "Keneuoe", "Mohau", "Thabang", "Boitumelo", "Seabata", "Nthabeleng", "Motlatsi", "Liteboho",
];
const SURNAMES = [
  "Mokoena", "Mohapi", "Letsie", "Ntho", "Molapo", "Lerotholi", "Phafoli", "Sekhesa", "Makara", "Khoali",
  "Thamae", "Ralebese", "Sello", "Mofokeng", "Mokhele", "Ramaili", "Nkuebe", "Mothibeli", "Leuta", "Matela",
  "Tau", "Sefali", "Mapetla", "Lebona", "Rantso", "Mosala", "Nthejane", "Phakoe", "Motsamai", "Makhetha",
];

const studentNumber = (index: number) => `TT${String(index + 1).padStart(5, "0")}`;

// Cohorts get consecutive student numbers in the order above, then the spare students
const buildStudents = () => {
  const students: { studentId: string; name: string; surname: string; email: string; cohort?: CohortKey }[] = [];
  const add = (cohort?: CohortKey) => {
    const index = students.length;
    const studentId = studentNumber(index);
    students.push({
      studentId,
      name: FIRST_NAMES[index % FIRST_NAMES.length]!,
      surname: SURNAMES[(index * 7 + Math.floor(index / FIRST_NAMES.length)) % SURNAMES.length]!,
      email: `${studentId.toLowerCase()}@${SAMPLE_DOMAIN}`,
      ...(cohort ? { cohort } : {}),
    });
  };
  for (const [cohort, { size }] of Object.entries(COHORTS) as [CohortKey, { size: number }][]) {
    for (let i = 0; i < size; i += 1) add(cohort);
  }
  for (let i = 0; i < SPARE_STUDENTS; i += 1) add();
  return students;
};

const lecturerEmail = (name: string) =>
  `${name.split(" ").slice(1).join(".").toLowerCase()}@${SAMPLE_DOMAIN}`;

const readFlag = (name: string): string | undefined => {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  const next = index >= 0 ? process.argv[index + 1] : undefined;
  return next && !next.startsWith("--") ? next : undefined;
};

function fail(message: string): never {
  throw new Error(message);
}

const hostOf = (uri: string): string => {
  const match = /^mongodb(?:\+srv)?:\/\/(?:[^@/]*@)?([^/?]+)/.exec(uri);
  return match?.[1] ?? fail("MONGO_URI isn't a MongoDB connection string");
};

const isLocalHost = (host: string): boolean => /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host);

const findInstitution = async (wanted: string | undefined) => {
  const all = await Institution.find().select("name").sort({ name: 1 }).lean();
  const names = all.map((institution) => `"${institution.name}"`).join(", ") || "none";
  if (wanted) {
    const match = /^[a-f0-9]{24}$/i.test(wanted)
      ? await Institution.findById(wanted).select("name").lean()
      : await Institution.findOne({ name: wanted }).collation(CASE_INSENSITIVE).select("name").lean();
    return match ?? fail(`No institution called "${wanted}". Institutions: ${names}`);
  }
  if (all.length === 1) return all[0]!;

  // With several, the one with a Registry user is the one someone can sign in to and test
  const registry = await Role.findOne({ name: "registry" }).collation(CASE_INSENSITIVE).select("_id").lean();
  const withRegistry = registry
    ? (await User.distinct("institution", { $or: [{ role: registry._id }, { additionalRoles: registry._id }] })).map(String)
    : [];
  const candidates = all.filter((institution) => withRegistry.includes(String(institution._id)));
  if (candidates.length === 1) return candidates[0]!;
  return fail(`Say which institution with --institution "<name>". Institutions: ${names}`);
};

const seed = async (institution: Types.ObjectId, academicYear: string, semester: number) => {
  const students = buildStudents();
  const studentIds = students.map((student) => student.studentId);

  // Student numbers are unique across institutions, so sample students can only belong to one of them
  const elsewhere = await Student.findOne({ studentId: { $in: studentIds }, institution: { $ne: institution } }).select("institution").lean();
  if (elsewhere) {
    const other = await Institution.findById(elsewhere.institution).select("name").lean();
    fail(`The sample students already belong to "${other?.name ?? elsewhere.institution}". Run --remove for that institution first.`);
  }

  // Timestamps are set only on insert, so records that were already there are left exactly as they were
  const now = new Date();
  const created = { createdAt: now, updatedAt: now };

  const rooms = await Room.bulkWrite(ROOMS.map((room) => ({
    updateOne: {
      filter: { institution, code: room.code },
      update: { $setOnInsert: { building: room.building, capacity: room.capacity, isComputerized: room.isComputerized ?? false, active: room.active ?? true, ...created } },
      upsert: true,
      timestamps: false,
    },
  })));

  const lecturers = await Lecturer.bulkWrite(Object.values(LECTURERS).map((name, index) => ({
    updateOne: {
      filter: { institution, email: lecturerEmail(name) },
      update: { $setOnInsert: { name, staffNumber: `SMP${String(index + 1).padStart(3, "0")}`, ...created } },
      upsert: true,
      timestamps: false,
    },
  })));

  const studentResult = await Student.bulkWrite(students.map((student) => ({
    updateOne: {
      filter: { studentId: student.studentId },
      update: { $setOnInsert: { institution, email: student.email, name: student.name, surname: student.surname, studentStatus: false, ...created } },
      upsert: true,
      timestamps: false,
    },
  })));

  const lecturerIds = new Map(
    (await Lecturer.find({ institution, email: SAMPLE_EMAIL }).select("_id email").lean()).map((lecturer) => [lecturer.email, lecturer._id]),
  );
  const studentObjectIds = new Map(
    (await Student.find({ institution, studentId: { $in: studentIds } }).select("_id studentId").lean()).map((student) => [student.studentId, student._id]),
  );
  const cohortStudents = (cohort: CohortKey) =>
    students.filter((student) => student.cohort === cohort).map((student) => studentObjectIds.get(student.studentId)!);

  const modules = await CourseModule.bulkWrite(MODULES.map((module) => ({
    updateOne: {
      filter: { institution, academicYear, semester, code: module.code },
      update: {
        $setOnInsert: {
          name: module.name,
          lecturer: lecturerIds.get(lecturerEmail(LECTURERS[module.lecturer]))!,
          requiresComputers: module.requiresComputers ?? false,
          sessionsPerWeek: module.sessionsPerWeek,
          durationHours: module.durationHours,
          students: module.cohorts.flatMap(cohortStudents),
          ...created,
        },
      },
      upsert: true,
      timestamps: false,
    },
  })));

  const line = (label: string, result: { upsertedCount: number; matchedCount: number }) =>
    console.log(`  ${label}: ${result.upsertedCount} added${result.matchedCount ? `, ${result.matchedCount} already there and left as they were` : ""}`);
  console.log(`\nSample data for ${academicYear} semester ${semester}:`);
  line("Rooms", rooms);
  line("Lecturers", lecturers);
  line("Students", studentResult);
  line("Modules", modules);

  const spare = students.filter((student) => !student.cohort);
  console.log(`
To try it, sign in as Registry, open Room Allocation, choose ${academicYear} semester ${semester}, and click Generate timetable.
  - DSC290 needs a computer lab for 105 students and the biggest lab seats 90, so it waits to be placed.
  - Room A109 is marked as not in use, so nothing should be put in it.
  - ${LECTURERS.sello} teaches nothing, so he can be deleted.
  - Students ${spare[0]?.studentId}–${spare.at(-1)?.studentId} aren't in any module. Paste them into one to enrol them (TT99999 isn't a student, to see the not-found message).
Remove it all with: npm run seed:timetabling -- --remove`);
};

const remove = async (institution: Types.ObjectId) => {
  const [lecturers, rooms, students] = await Promise.all([
    Lecturer.find({ institution, email: SAMPLE_EMAIL }).select("_id").lean(),
    Room.find({ institution, building: SAMPLE_BUILDING }).select("_id").lean(),
    Student.find({ institution, email: SAMPLE_EMAIL }).select("_id studentId").lean(),
  ]);
  const lecturerIds = lecturers.map((lecturer) => lecturer._id);
  const roomIds = rooms.map((room) => room._id);
  const modules = await CourseModule.find({ institution, lecturer: { $in: lecturerIds } }).select("_id").lean();
  const moduleIds = modules.map((module) => module._id);

  // Removing a sample room would leave one of Registry's own classes in a room that no longer exists
  const stranded = await ClassSession.countDocuments({ institution, room: { $in: roomIds }, module: { $nin: moduleIds } });
  if (stranded) {
    fail(`${stranded} of your own classes are timetabled in sample rooms. Mark those rooms as not in use, generate the timetable again, then run --remove.`);
  }

  // Someone may have registered as a sample student to try the app, so those are kept
  const withLogin = new Set(await User.distinct("studentId", { studentId: { $in: students.map((student) => student.studentId) } }));
  const removableStudents = students.filter((student) => !withLogin.has(student.studentId)).map((student) => student._id);

  const touchedRuns = [
    ...(await ClassSession.distinct("run", { institution, module: { $in: moduleIds } })),
    ...(await TimetableRun.distinct("_id", { institution, "unplaced.module": { $in: moduleIds } })),
  ].map((run) => new Types.ObjectId(String(run)));

  const sessions = await ClassSession.deleteMany({ institution, module: { $in: moduleIds } });
  await TimetableRun.updateMany({ institution }, { $pull: { unplaced: { module: { $in: moduleIds } } } });
  // Timetables that only ever held sample classes are now empty
  const stillUsed = (await ClassSession.distinct("run", { run: { $in: touchedRuns } })).map(String);
  const runs = await TimetableRun.deleteMany({
    institution,
    _id: { $in: touchedRuns.filter((run) => !stillUsed.includes(String(run))) },
    unplaced: { $size: 0 },
  });
  await CourseModule.updateMany({ institution }, { $pull: { students: { $in: removableStudents } } });
  const moduleResult = await CourseModule.deleteMany({ _id: { $in: moduleIds } });
  const lecturerResult = await Lecturer.deleteMany({ _id: { $in: lecturerIds } });
  const roomResult = await Room.deleteMany({ _id: { $in: roomIds } });
  const studentResult = await Student.deleteMany({ _id: { $in: removableStudents } });

  const count = (amount: number, noun: string, plural = `${noun}s`) => `${amount} ${amount === 1 ? noun : plural}`;
  console.log(`
Removed ${count(roomResult.deletedCount, "room")}, ${count(lecturerResult.deletedCount, "lecturer")}, ${count(moduleResult.deletedCount, "module")}, ${count(studentResult.deletedCount, "student")},
${count(sessions.deletedCount, "timetabled class", "timetabled classes")} and ${count(runs.deletedCount, "timetable")} that only held sample classes.`);
  if (withLogin.size) console.log(`Kept ${count(withLogin.size, "sample student")} with a login: ${[...withLogin].join(", ")}`);
};

const run = async () => {
  const host = hostOf(getMongoUri());
  if (!isLocalHost(host) && readFlag("confirm-host") !== host) {
    fail(`MONGO_URI points at ${host}, which isn't this machine. Add --confirm-host=${host} if you want sample data there.`);
  }

  const now = new Date();
  const academicYear = readFlag("year") ?? `${now.getFullYear()}/${now.getFullYear() + 1}`;
  if (!isAcademicYear(academicYear)) fail(ACADEMIC_YEAR_MESSAGE);
  const semester = Number(readFlag("semester") ?? 1);
  if (!(SEMESTERS as readonly number[]).includes(semester)) fail(`Semester must be ${SEMESTERS.join(" or ")}`);

  await connectDatabase();
  // The timetabling collections may be new, so make sure their unique indexes exist before upserting
  await Promise.all([Room.init(), Lecturer.init(), CourseModule.init(), ClassSession.init(), TimetableRun.init()]);

  const institution = await findInstitution(readFlag("institution"));
  console.log(`Institution: ${institution.name} (database on ${host})`);

  if (process.argv.includes("--remove")) await remove(institution._id);
  else await seed(institution._id, academicYear, semester);
};

run()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
