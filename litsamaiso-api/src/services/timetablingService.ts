import { Types } from "mongoose";
import { MAX_SESSION_HOURS, MAX_SESSIONS_PER_WEEK, SEMESTERS } from "../constants/timetabling.js";
import { ClassSession, hoursBetween } from "../models/ClassSession.js";
import { CourseModule } from "../models/CourseModule.js";
import { Lecturer } from "../models/Lecturer.js";
import { Room } from "../models/Room.js";
import { Student } from "../models/Student.js";
import { TimetableRun } from "../models/TimetableRun.js";
import { auditActor, recordAudit } from "../utils/auditLog.js";
import AppError from "../utils/errors.js";
import { withOptionalTransaction } from "../utils/transaction.js";
import { optionalString, requireAcademicYear, requireString } from "../utils/validation.js";
import {
  buildContext,
  checkPlacement,
  DEFAULT_RULES,
  generateTimetable,
  slotFor,
  type Placement,
  type SolverModule,
  type SolverRoom,
  type TimetableRules,
  type UnplacedSession,
} from "./timetableSolver.js";

export type Actor = { _id: unknown; email?: string; role?: any; institution: unknown };
export type Term = { academicYear: string; semester: number };

export const institutionOf = (actor: Actor) => new Types.ObjectId(String(actor.institution));
const actorIdOf = (actor: Actor) => new Types.ObjectId(String(actor._id));

export const audit = (actor: Actor, action: string, targetCollection: string, targetId: unknown, details?: Record<string, any>) =>
  recordAudit({ ...auditActor(actor), action, targetCollection, targetId: String(targetId), ...(details ? { details } : {}) });

const objectId = (value: unknown, label: string) => {
  const text = String(value ?? "").trim();
  if (!/^[a-f0-9]{24}$/i.test(text)) throw new AppError(`${label} not found`, 404);
  return new Types.ObjectId(text);
};

const wholeNumber = (value: unknown, field: string, min: number, max: number) => {
  const number = Number(value);
  if (value === "" || value === null || value === undefined || !Number.isInteger(number) || number < min || number > max) {
    throw new AppError(`${field} must be a whole number from ${min} to ${max}`);
  }
  return number;
};

// A whole number that may be left out, e.g. a field the form doesn't send. Anything given is still checked.
const optionalWholeNumber = (value: unknown, field: string, min: number, max: number, fallback: number) =>
  value === "" || value === null || value === undefined ? fallback : wholeNumber(value, field, min, max);

export const flag = (value: unknown) => value === true || ["true", "1", "yes", "on"].includes(String(value).toLowerCase());

const semesterOf = (value: unknown) => {
  const semester = Number(value);
  if (!(SEMESTERS as readonly number[]).includes(semester)) throw new AppError(`Semester must be ${SEMESTERS.join(" or ")}`);
  return semester;
};

export const termOf = (input: Record<string, any>): Term => ({
  academicYear: requireAcademicYear(input.academicYear),
  semester: semesterOf(input.semester),
});

export const isDuplicateKey = (error: any) => error?.code === 11000;

const unique = <T>(values: T[]) => [...new Set(values)];

// ---------------------------------------------------------------------------
// Rooms
// ---------------------------------------------------------------------------

export const listRooms = async (actor: Actor) =>
  Room.find({ institution: institutionOf(actor) }).sort({ building: 1, code: 1 }).lean();

const normalizeRoomTypeValue = (value: string | undefined): string => {
  if (!value) return "30-seater";
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, " ");
  if (normalized.includes("lecture")) return "lecture theatre";
  if (normalized.includes("30") || normalized.includes("thirty")) return "30-seater";
  if (normalized.includes("computer") || normalized.includes("lab")) return "computer lab";
  return "30-seater";
};

export const roomInput = (input: Record<string, any>) => {
  const building = optionalString(input.building);
  return {
    code: requireString(input.code, "Room code", { max: 30 }).toUpperCase(),
    building: building ?? "",
    capacity: wholeNumber(input.capacity, "Capacity", 1, 2000),
    isComputerized: flag(input.isComputerized),
    roomType: normalizeRoomTypeValue(input.roomType),
    active: input.active === undefined ? true : flag(input.active),
  };
};

export const createRoom = async (actor: Actor, input: Record<string, any>) => {
  const room = roomInput(input);
  try {
    const created = await Room.create({ ...room, institution: institutionOf(actor) } as any);
    await audit(actor, "timetabling.room.created", "Room", created._id, { room });
    return created.toObject();
  } catch (error) {
    if (isDuplicateKey(error)) throw new AppError(`Room ${room.code} already exists`, 409);
    throw error;
  }
};

export const updateRoom = async (actor: Actor, roomId: string, input: Record<string, any>) => {
  const room = await Room.findOne({ _id: objectId(roomId, "Room"), institution: institutionOf(actor) });
  if (!room) throw new AppError("Room not found", 404);
  const changes = roomInput({ ...room.toObject(), ...input });
  room.set(changes);
  try {
    await room.save();
  } catch (error) {
    if (isDuplicateKey(error)) throw new AppError(`Room ${changes.code} already exists`, 409);
    throw error;
  }
  await audit(actor, "timetabling.room.updated", "Room", room._id, { changes });
  return room.toObject();
};

export const deleteRoom = async (actor: Actor, roomId: string) => {
  const id = objectId(roomId, "Room");
  const room = await Room.findOne({ _id: id, institution: institutionOf(actor) }).lean();
  if (!room) throw new AppError("Room not found", 404);
  if (await ClassSession.exists({ room: id })) {
    throw new AppError(`${room.code} is on a timetable. Mark it as not in use instead, so past timetables still show it.`, 409);
  }
  await Room.deleteOne({ _id: id, institution: institutionOf(actor) });
  await audit(actor, "timetabling.room.deleted", "Room", id, { code: room.code });
  return { id: roomId, deleted: true };
};

// Creates a numbered series of rooms, e.g. prefix "LAB-", start "01", count 3 gives
// LAB-01, LAB-02, LAB-03. Codes that already exist are skipped, not changed.
export const generateRooms = async (actor: Actor, input: Record<string, any>) => {
  const prefix = (optionalString(input.prefix) ?? "").toUpperCase();
  const start = String(input.startNumber ?? "1").trim();
  if (!/^\d{1,6}$/.test(start)) throw new AppError("Start number must be digits, such as 101 or 01");
  const count = wholeNumber(input.count, "Number of rooms", 1, 200);
  const template = roomInput({ ...input, code: `${prefix}${start}` });
  const codes = Array.from({ length: count }, (_, index) => `${prefix}${String(Number(start) + index).padStart(start.length, "0")}`);

  const existing = new Set(
    (await Room.find({ institution: institutionOf(actor), code: { $in: codes } }).select("code").lean()).map((room) => room.code),
  );
  const fresh = codes.filter((code) => !existing.has(code));
  if (fresh.length) {
    try {
      await Room.insertMany(fresh.map((code) => ({ ...template, code, institution: institutionOf(actor) })));
    } catch (error) {
      if (isDuplicateKey(error)) throw new AppError("Some of these rooms were just added by someone else. Reload and try again.", 409);
      throw error;
    }
  }
  await audit(actor, "timetabling.room.generated", "Room", institutionOf(actor), { created: fresh, skipped: [...existing] });
  return { created: fresh, skipped: codes.filter((code) => existing.has(code)) };
};

// ---------------------------------------------------------------------------
// Lecturers
// ---------------------------------------------------------------------------

export const listLecturers = async (actor: Actor) => {
  const [lecturers, counts] = await Promise.all([
    Lecturer.find({ institution: institutionOf(actor) }).sort({ name: 1 }).lean(),
    CourseModule.aggregate<{ _id: Types.ObjectId; count: number }>([
      { $match: { institution: institutionOf(actor) } },
      { $group: { _id: "$lecturer", count: { $sum: 1 } } },
    ]),
  ]);
  const moduleCount = new Map(counts.map((item) => [String(item._id), item.count]));
  return lecturers.map((lecturer) => ({ ...lecturer, moduleCount: moduleCount.get(String(lecturer._id)) ?? 0 }));
};

export const lecturerInput = (input: Record<string, any>) => {
  const email = requireString(input.email, "Email", { max: 200 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError("Enter a valid email address");
  return {
    name: requireString(input.name, "Name", { max: 120 }),
    email,
    staffNumber: optionalString(input.staffNumber) ?? "",
  };
};

export const createLecturer = async (actor: Actor, input: Record<string, any>) => {
  const lecturer = lecturerInput(input);
  try {
    const created = await Lecturer.create({ ...lecturer, institution: institutionOf(actor) });
    await audit(actor, "timetabling.lecturer.created", "Lecturer", created._id, { lecturer });
    return created.toObject();
  } catch (error) {
    if (isDuplicateKey(error)) throw new AppError(`A lecturer with the email ${lecturer.email} already exists`, 409);
    throw error;
  }
};

export const updateLecturer = async (actor: Actor, lecturerId: string, input: Record<string, any>) => {
  const lecturer = await Lecturer.findOne({ _id: objectId(lecturerId, "Lecturer"), institution: institutionOf(actor) });
  if (!lecturer) throw new AppError("Lecturer not found", 404);
  const changes = lecturerInput({ ...lecturer.toObject(), ...input });
  lecturer.set(changes);
  try {
    await lecturer.save();
  } catch (error) {
    if (isDuplicateKey(error)) throw new AppError(`A lecturer with the email ${changes.email} already exists`, 409);
    throw error;
  }
  await audit(actor, "timetabling.lecturer.updated", "Lecturer", lecturer._id, { changes });
  return lecturer.toObject();
};

export const deleteLecturer = async (actor: Actor, lecturerId: string) => {
  const id = objectId(lecturerId, "Lecturer");
  const lecturer = await Lecturer.findOne({ _id: id, institution: institutionOf(actor) }).lean();
  if (!lecturer) throw new AppError("Lecturer not found", 404);
  if (await CourseModule.exists({ institution: institutionOf(actor), lecturer: id })) {
    throw new AppError(`${lecturer.name} still teaches modules. Give those modules to another lecturer first.`, 409);
  }
  await Lecturer.deleteOne({ _id: id, institution: institutionOf(actor) });
  await audit(actor, "timetabling.lecturer.deleted", "Lecturer", id, { name: lecturer.name, email: lecturer.email });
  return { id: lecturerId, deleted: true };
};

// ---------------------------------------------------------------------------
// Modules and the students who take them
// ---------------------------------------------------------------------------

export const listModules = async (actor: Actor, query: Record<string, any>) => {
  const term = termOf(query);
  return CourseModule.aggregate([
    { $match: { institution: institutionOf(actor), ...term } },
    {
      $project: {
        code: 1,
        name: 1,
        lecturer: 1,
        academicYear: 1,
        semester: 1,
        requiresComputers: 1,
        sessionsPerWeek: 1,
        durationHours: 1,
        credits: 1,
        batches: 1,
        preferredRoomType: 1,
        specificRequirements: 1,
        studentCount: { $size: "$students" },
      },
    },
    { $sort: { code: 1 } },
    { $lookup: { from: "lecturers", localField: "lecturer", foreignField: "_id", as: "lecturer", pipeline: [{ $project: { name: 1, email: 1 } }] } },
    { $unwind: { path: "$lecturer", preserveNullAndEmptyArrays: true } },
  ]);
};

const normalizeRoomType = (value: string | undefined): string => {
  if (!value) return "any";
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, " ");
  if (normalized.includes("lecture")) return "lecture theatre";
  if (normalized.includes("30") || normalized.includes("thirty")) return "30-seater";
  if (normalized.includes("computer") || normalized.includes("lab")) return "computer lab";
  return "any";
};

// A module's own fields, without its lecturer or term
export const moduleFields = (input: Record<string, any>) => ({
  code: requireString(input.code, "Module code", { max: 30 }).toUpperCase(),
  name: requireString(input.name, "Module name", { max: 200 }),
  requiresComputers: flag(input.requiresComputers),
  sessionsPerWeek: wholeNumber(input.sessionsPerWeek, "Classes per week", 1, MAX_SESSIONS_PER_WEEK),
  durationHours: wholeNumber(input.durationHours, "Hours per class", 1, MAX_SESSION_HOURS),
  credits: optionalWholeNumber(input.credits, "Credits", 1, 100, 10),
  batches: optionalWholeNumber(input.batches, "Batches", 1, 20, 1),
  preferredRoomType: normalizeRoomType(input.preferredRoomType),
  specificRequirements: String(input.specificRequirements ?? ""),
});

const moduleInput = async (actor: Actor, input: Record<string, any>) => {
  const lecturer = objectId(input.lecturer?._id ?? input.lecturer ?? input.lecturerId, "Lecturer");
  if (!(await Lecturer.exists({ _id: lecturer, institution: institutionOf(actor) }))) throw new AppError("Lecturer not found", 404);
  return { ...moduleFields(input), lecturer, ...termOf(input) };
};

const duplicateModuleMessage = (module: { code: string; academicYear: string; semester: number }) =>
  `${module.code} already exists for ${module.academicYear} semester ${module.semester}`;

export const createModule = async (actor: Actor, input: Record<string, any>) => {
  const module = await moduleInput(actor, input);
  try {
    const created = await CourseModule.create({ ...module, institution: institutionOf(actor) } as any);
    await audit(actor, "timetabling.module.created", "CourseModule", created._id, { module });
    return created.toObject();
  } catch (error) {
    if (isDuplicateKey(error)) throw new AppError(duplicateModuleMessage(module), 409);
    throw error;
  }
};

export const updateModule = async (actor: Actor, moduleId: string, input: Record<string, any>) => {
  const module = await CourseModule.findOne({ _id: objectId(moduleId, "Module"), institution: institutionOf(actor) });
  if (!module) throw new AppError("Module not found", 404);
  const { students: _students, ...current } = module.toObject();
  const changes = await moduleInput(actor, { ...current, ...input });
  module.set(changes);
  try {
    await module.save();
  } catch (error) {
    if (isDuplicateKey(error)) throw new AppError(duplicateModuleMessage(changes), 409);
    throw error;
  }
  await audit(actor, "timetabling.module.updated", "CourseModule", module._id, { changes });
  const { students, ...saved } = module.toObject();
  return { ...saved, studentCount: students.length };
};

// A deleted module is no longer taught, so its classes come off every current timetable.
// Archived timetables keep their sessions as a record.
export const deleteModule = async (actor: Actor, moduleId: string) => {
  const id = objectId(moduleId, "Module");
  const module = await CourseModule.findOne({ _id: id, institution: institutionOf(actor) }).lean();
  if (!module) throw new AppError("Module not found", 404);
  const currentRuns = await TimetableRun.find({ institution: institutionOf(actor), status: { $ne: "archived" } }).distinct("_id");
  const removed = await ClassSession.deleteMany({ run: { $in: currentRuns }, module: id });
  await TimetableRun.updateMany({ _id: { $in: currentRuns } }, { $pull: { unplaced: { module: id } } });
  await CourseModule.deleteOne({ _id: id, institution: institutionOf(actor) });
  await audit(actor, "timetabling.module.deleted", "CourseModule", id, { code: module.code, sessionsRemoved: removed.deletedCount });
  return { id: moduleId, deleted: true };
};

export const listModuleStudents = async (actor: Actor, moduleId: string) => {
  const module = await CourseModule.findOne({ _id: objectId(moduleId, "Module"), institution: institutionOf(actor) }).select("students").lean();
  if (!module) throw new AppError("Module not found", 404);
  return Student.find({ _id: { $in: module.students }, institution: institutionOf(actor) })
    .select("studentId name surname email")
    .sort({ surname: 1, name: 1 })
    .lean();
};

// Enrols students by their student numbers, as pasted from a spreadsheet column
export const addModuleStudents = async (actor: Actor, moduleId: string, input: Record<string, any>) => {
  const id = objectId(moduleId, "Module");
  const module = await CourseModule.findOne({ _id: id, institution: institutionOf(actor) }).select("students code").lean();
  if (!module) throw new AppError("Module not found", 404);

  const raw = Array.isArray(input.studentIds) ? input.studentIds.join("\n") : String(input.studentIds ?? "");
  const studentNumbers = unique(raw.split(/[\s,;]+/).map((value) => value.trim()).filter(Boolean));
  if (!studentNumbers.length) throw new AppError("Enter at least one student number");
  if (studentNumbers.length > 2000) throw new AppError("Add at most 2000 students at a time");

  const found = await Student.find({ institution: institutionOf(actor), studentId: { $in: studentNumbers } }).select("_id studentId").lean();
  const enrolled = new Set(module.students.map(String));
  const toAdd = found.filter((student) => !enrolled.has(String(student._id)));
  const foundNumbers = new Set(found.map((student) => student.studentId));

  if (toAdd.length) {
    await CourseModule.updateOne({ _id: id, institution: institutionOf(actor) }, { $addToSet: { students: { $each: toAdd.map((student) => student._id) } } });
    await audit(actor, "timetabling.module.students_added", "CourseModule", id, { code: module.code, studentIds: toAdd.map((student) => student.studentId) });
  }
  return {
    added: toAdd.length,
    alreadyEnrolled: found.length - toAdd.length,
    notFound: studentNumbers.filter((number) => !foundNumbers.has(number)),
  };
};

export const removeModuleStudent = async (actor: Actor, moduleId: string, studentId: string) => {
  const id = objectId(moduleId, "Module");
  const student = objectId(studentId, "Student");
  const result = await CourseModule.updateOne({ _id: id, institution: institutionOf(actor) }, { $pull: { students: student } });
  if (!result.matchedCount) throw new AppError("Module not found", 404);
  await audit(actor, "timetabling.module.student_removed", "CourseModule", id, { student: String(student) });
  return { id: studentId, removed: result.modifiedCount > 0 };
};

// ---------------------------------------------------------------------------
// Timetables
// ---------------------------------------------------------------------------

const toSolverModules = (modules: any[]): SolverModule[] =>
  modules.map((module) => ({
    id: String(module._id),
    code: module.code,
    lecturerId: String(module.lecturer?._id ?? module.lecturer),
    lecturerName: module.lecturer?.name ?? "The lecturer",
    studentIds: (module.students ?? []).map(String),
    requiresComputers: Boolean(module.requiresComputers),
    sessionsPerWeek: module.sessionsPerWeek,
    durationHours: module.durationHours,
    credits: module.credits ?? 10,
    batches: module.batches ?? 1,
    preferredRoomType: module.preferredRoomType ?? "any",
    specificRequirements: module.specificRequirements ?? "",
  }));

const toSolverRooms = (rooms: any[]): SolverRoom[] =>
  rooms.map((room) => ({
    id: String(room._id),
    code: room.code,
    capacity: room.capacity,
    isComputerized: Boolean(room.isComputerized),
    roomType: room.roomType ?? "30-seater",
    active: room.active !== false,
  }));

const toPlacement = (session: any): Placement => ({
  moduleId: String(session.module),
  roomId: String(session.room),
  day: session.day,
  startHour: session.startHour,
  endHour: session.endHour,
  batch: session.batch ?? 1,
});

const rulesOf = (run: any): TimetableRules => ({
  days: run.rules?.days ?? DEFAULT_RULES.days,
  dayStartHour: run.rules?.dayStartHour ?? DEFAULT_RULES.dayStartHour,
  dayEndHour: run.rules?.dayEndHour ?? DEFAULT_RULES.dayEndHour,
  minLecturerGapHours: run.rules?.minLecturerGapHours ?? DEFAULT_RULES.minLecturerGapHours,
});

const findRun = async (actor: Actor, runId: string) => {
  const run = await TimetableRun.findOne({ _id: objectId(runId, "Timetable"), institution: institutionOf(actor) }).lean();
  if (!run) throw new AppError("Timetable not found", 404);
  return run;
};

export const listRuns = async (actor: Actor, query: Record<string, any>) => {
  const term = termOf(query);
  const runs = await TimetableRun.find({ institution: institutionOf(actor), ...term }).sort({ createdAt: -1 }).lean();
  return runs.map(({ unplaced, ...run }) => ({ ...run, unplacedCount: unplaced.length }));
};

// Checks every class against the rest with today's data. A timetable that was fine when it
// was generated can break later, e.g. when a student joins a module or a room shrinks.
const findIssues = (run: any, sessions: any[], modules: any[], rooms: any[]) => {
  if (run.status === "archived") return [];
  const ctx = buildContext(toSolverModules(modules), toSolverRooms(rooms), rulesOf(run));
  const placements = sessions.map(toPlacement);
  const issues: Array<{ sessionId: string; message: string }> = [];
  placements.forEach((placement, index) => {
    const others = placements.filter((other, otherIndex) => otherIndex !== index && other.day === placement.day);
    const clash = checkPlacement(ctx, placement, others);
    if (clash) issues.push({ sessionId: String(sessions[index]._id), message: clash.message });
  });
  return issues;
};

// A timetabled class as the timetable shows it, with its module, lecturer and room
export const sessionView = (session: any, module: any, room: any) => ({
  _id: session._id,
  day: session.day,
  startHour: session.startHour,
  endHour: session.endHour,
  batch: session.batch ?? 1,
  module: module
    ? { _id: module._id, code: module.code, name: module.name, requiresComputers: module.requiresComputers, studentCount: module.students?.length ?? 0 }
    : null,
  lecturer: module?.lecturer ? { _id: module.lecturer._id, name: module.lecturer.name } : null,
  room: room
    ? { _id: room._id, code: room.code, building: room.building, capacity: room.capacity, isComputerized: room.isComputerized, roomType: room.roomType }
    : null,
});

// A class the generator couldn't place. Each batch is its own waiting class, so the batch is kept.
export const waitingEntry = (entry: UnplacedSession, codeOf: Map<string, string>) => ({
  module: entry.moduleId,
  moduleCode: codeOf.get(entry.moduleId) ?? "",
  session: entry.session,
  batch: entry.batch,
  reason: entry.reason,
});

export const getRun = async (actor: Actor, runId: string) => {
  const run = await findRun(actor, runId);
  const sessions = await ClassSession.find({ run: run._id }).sort({ day: 1, startHour: 1 }).lean();
  const moduleIds = unique([...sessions.map((session) => String(session.module)), ...run.unplaced.map((entry) => String(entry.module))]);
  const [modules, rooms] = await Promise.all([
    CourseModule.find({ _id: { $in: moduleIds }, institution: institutionOf(actor) }).populate("lecturer", "name email").lean(),
    Room.find({ institution: institutionOf(actor) }).sort({ code: 1 }).lean(),
  ]);
  const moduleById = new Map(modules.map((module: any) => [String(module._id), module]));
  const roomById = new Map(rooms.map((room) => [String(room._id), room]));

  return {
    run,
    sessions: sessions.map((session) => sessionView(session, moduleById.get(String(session.module)), roomById.get(String(session.room)))),
    // What Registry needs to place a waiting class by hand
    unplaced: run.unplaced.map((entry) => {
      const module: any = moduleById.get(String(entry.module));
      return {
        ...entry,
        module: String(entry.module),
        durationHours: module?.durationHours ?? 1,
        requiresComputers: Boolean(module?.requiresComputers),
        studentCount: module?.students.length ?? 0,
        lecturerName: module?.lecturer?.name ?? "",
      };
    }),
    rooms,
    issues: findIssues(run, sessions, modules, rooms),
  };
};

export const generateRun = async (actor: Actor, input: Record<string, any>) => {
  const term = termOf(input);
  const [modules, rooms] = await Promise.all([
    CourseModule.find({ institution: institutionOf(actor), ...term }).populate("lecturer", "name").lean(),
    Room.find({ institution: institutionOf(actor), active: true }).lean(),
  ]);
  if (!modules.length) throw new AppError(`There are no modules for ${term.academicYear} semester ${term.semester} yet. Add modules first.`);
  if (!rooms.length) throw new AppError("There are no rooms in use yet. Add rooms first.");

  const solverModules = toSolverModules(modules);
  const result = generateTimetable(solverModules, toSolverRooms(rooms), { rules: DEFAULT_RULES });
  const codeOf = new Map(solverModules.map((module) => [module.id, module.code]));

  const run = await TimetableRun.create({
    institution: institutionOf(actor),
    ...term,
    status: "draft",
    rules: DEFAULT_RULES,
    unplaced: result.unplaced.map((entry) => waitingEntry(entry, codeOf)),
    generatedBy: actorIdOf(actor),
  });
  try {
    await ClassSession.insertMany(
      result.placements.map((placement) => ({
        institution: institutionOf(actor),
        run: run._id,
        module: placement.moduleId,
        room: placement.roomId,
        day: placement.day,
        startHour: placement.startHour,
        endHour: placement.endHour,
        hours: hoursBetween(placement.startHour, placement.endHour),
        batch: placement.batch,
      })),
    );
  } catch (error) {
    await ClassSession.deleteMany({ run: run._id });
    await TimetableRun.deleteOne({ _id: run._id });
    throw error;
  }

  // The new draft replaces older drafts for the same semester; the published one stays
  // until this draft is published
  const older = await TimetableRun.find({
    institution: institutionOf(actor),
    ...term,
    status: "draft",
    _id: { $ne: run._id },
    createdAt: { $lt: run.createdAt ?? new Date() },
  }).distinct("_id");
  if (older.length) {
    await ClassSession.deleteMany({ run: { $in: older } });
    await TimetableRun.deleteMany({ _id: { $in: older } });
  }

  await audit(actor, "timetabling.run.generated", "TimetableRun", run._id, {
    ...term,
    placed: result.placements.length,
    unplaced: result.unplaced.length,
  });
  return getRun(actor, String(run._id));
};

export const publishRun = async (actor: Actor, runId: string) => {
  const current = await getRun(actor, runId);
  const { run } = current;
  if (run.status !== "draft") throw new AppError("Only a draft timetable can be published", 409);
  if (current.issues.length) {
    throw new AppError(
      `This timetable has ${current.issues.length} clash${current.issues.length === 1 ? "" : "es"} caused by changes made after it was generated. Move those classes or generate it again before publishing.`,
      409,
    );
  }

  await withOptionalTransaction(async (session) => {
    await TimetableRun.updateMany(
      { institution: institutionOf(actor), academicYear: run.academicYear, semester: run.semester, status: "published" },
      { $set: { status: "archived" } },
    ).session(session);
    const published = await TimetableRun.updateOne(
      { _id: run._id, status: "draft" },
      { $set: { status: "published", publishedAt: new Date(), publishedBy: actorIdOf(actor) } },
    ).session(session);
    if (published.modifiedCount !== 1) throw new AppError("This timetable was changed by someone else. Reload and try again.", 409);
  });

  await audit(actor, "timetabling.run.published", "TimetableRun", run._id, { academicYear: run.academicYear, semester: run.semester });
  return getRun(actor, runId);
};

const editableRun = (run: any) => {
  if (run.status === "archived") throw new AppError("Archived timetables can't be changed", 409);
};

// Runs the same rules the generator uses against the run's other classes that day
const assertPlaceable = async (
  actor: Actor,
  run: any,
  moduleId: string,
  target: { day: number; startHour: number; roomId: Types.ObjectId; batch: number },
  excludeSessionId?: Types.ObjectId,
) => {
  const others = await ClassSession.find({
    run: run._id,
    day: target.day,
    ...(excludeSessionId ? { _id: { $ne: excludeSessionId } } : {}),
  }).select("module room day startHour endHour batch").lean();
  const moduleIds = unique([moduleId, ...others.map((other) => String(other.module))]);
  const [modules, rooms] = await Promise.all([
    CourseModule.find({ _id: { $in: moduleIds }, institution: institutionOf(actor) }).populate("lecturer", "name").lean(),
    Room.find({ institution: institutionOf(actor) }).lean(),
  ]);
  const ctx = buildContext(toSolverModules(modules), toSolverRooms(rooms), rulesOf(run));
  const module = ctx.modules.get(moduleId);
  if (!module) throw new AppError("Module not found", 404);

  const slot = slotFor(module, target.day, target.startHour);
  const batch = excludeSessionId ? (others.find((s) => String(s._id) === String(excludeSessionId))?.batch ?? 1) : target.batch;
  const clash = checkPlacement(ctx, { ...slot, moduleId, roomId: String(target.roomId), batch }, others.map(toPlacement));
  if (clash) throw new AppError(clash.message, 409, `clash_${clash.kind}`);
  return slot;
};

const targetOf = (run: any, input: Record<string, any>) => {
  const rules = rulesOf(run);
  return {
    day: wholeNumber(input.day, "Day", 0, rules.days - 1),
    startHour: wholeNumber(input.startHour, "Start time", rules.dayStartHour, rules.dayEndHour - 1),
    roomId: objectId(input.roomId, "Room"),
    batch: optionalWholeNumber(input.batch, "Batch", 1, 20, 1),
  };
};

const bookedMessage = "That room was just booked by another change. Reload and try again.";

export const moveSession = async (actor: Actor, sessionId: string, input: Record<string, any>) => {
  const classSession = await ClassSession.findOne({ _id: objectId(sessionId, "Class"), institution: institutionOf(actor) });
  if (!classSession) throw new AppError("Class not found", 404);
  const run = await findRun(actor, String(classSession.run));
  editableRun(run);

  const target = targetOf(run, input);
  const slot = await assertPlaceable(actor, run, String(classSession.module), target, classSession._id);
  const before = toPlacement(classSession);
  classSession.set({ day: slot.day, startHour: slot.startHour, endHour: slot.endHour, hours: hoursBetween(slot.startHour, slot.endHour), room: target.roomId });
  try {
    await classSession.save();
  } catch (error) {
    if (isDuplicateKey(error)) throw new AppError(bookedMessage, 409);
    throw error;
  }
  await audit(actor, "timetabling.session.moved", "ClassSession", classSession._id, { before, after: toPlacement(classSession) });
  return getRun(actor, String(run._id));
};

// Registry places a class the generator couldn't fit, e.g. after adding a room
export const placeUnplaced = async (actor: Actor, runId: string, input: Record<string, any>) => {
  const run = await findRun(actor, runId);
  editableRun(run);
  const moduleId = objectId(input.moduleId, "Module");
  const session = optionalWholeNumber(input.session, "Session", 1, 10, 1);
  const batch = optionalWholeNumber(input.batch, "Batch", 1, 20, 1);
  const entry = run.unplaced.find((item) => String(item.module) === String(moduleId) && item.session === session && item.batch === batch);
  if (!entry) throw new AppError("This class (session " + session + ", batch " + batch + ") has no classes waiting to be placed", 404);

  const target = targetOf(run, input);
  const slot = await assertPlaceable(actor, run, String(moduleId), target);

  // Claim the waiting entry first so two people can't place the same class twice
  const claimed = await TimetableRun.updateOne(
    { _id: run._id, unplaced: { $elemMatch: { module: moduleId, session, batch } } },
    { $pull: { unplaced: { module: moduleId, session, batch } } },
  );
  if (!claimed.modifiedCount) throw new AppError("This class was just placed by someone else. Reload to see it.", 409);

  try {
    const created = await ClassSession.create({
      institution: institutionOf(actor),
      run: run._id,
      module: moduleId,
      room: target.roomId,
      ...slot,
      hours: hoursBetween(slot.startHour, slot.endHour),
      batch,
    });
    await audit(actor, "timetabling.session.placed", "ClassSession", created._id, { run: String(run._id), placement: toPlacement(created) });
  } catch (error) {
    await TimetableRun.updateOne({ _id: run._id }, { $push: { unplaced: entry } });
    if (isDuplicateKey(error)) throw new AppError(bookedMessage, 409);
    throw error;
  }
  return getRun(actor, runId);
};
