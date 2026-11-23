import { DAY_END_HOUR, DAY_START_HOUR, MIN_LECTURER_GAP_HOURS, TEACHING_DAYS } from "../constants/timetabling.js";

// Pure scheduling logic: no database access, so every rule can be tested on its own.
// The generator and Registry's manual moves both go through timeClash/roomClash, so a
// session can never be placed by hand somewhere the generator would have refused.

export type TimetableRules = {
  days: number;
  dayStartHour: number;
  dayEndHour: number;
  minLecturerGapHours: number;
};

export const DEFAULT_RULES: TimetableRules = {
  days: TEACHING_DAYS.length,
  dayStartHour: DAY_START_HOUR,
  dayEndHour: DAY_END_HOUR,
  minLecturerGapHours: MIN_LECTURER_GAP_HOURS,
};

export type SolverRoom = {
  id: string;
  code: string;
  capacity: number;
  isComputerized: boolean;
  roomType: string;
  active?: boolean;
};

export type SolverModule = {
  id: string;
  code: string;
  lecturerId: string;
  lecturerName: string;
  studentIds: string[];
  requiresComputers: boolean;
  sessionsPerWeek: number;
  durationHours: number;
  credits: number;
  batches: number;
  preferredRoomType: string;
  specificRequirements: string;
};

export type Slot = { day: number; startHour: number; endHour: number };
export type Placement = Slot & { moduleId: string; roomId: string; batch: number };
export type UnplacedSession = { moduleId: string; session: number; batch: number; reason: string };
export type SolverResult = { placements: Placement[]; unplaced: UnplacedSession[] };

export type ClashKind = "hours" | "module" | "lecturer" | "students" | "room";
export type Clash = { kind: ClashKind; message: string };

export type TimetableContext = {
  rules: TimetableRules;
  modules: Map<string, SolverModule>;
  rooms: Map<string, SolverRoom>;
  // For each module, the other modules that share at least one student with it
  sharedStudents: Map<string, Set<string>>;
};

export const formatHour = (hour: number) => `${String(hour).padStart(2, "0")}:00`;
export const formatSlot = (slot: Slot) =>
  `${TEACHING_DAYS[slot.day] ?? `Day ${slot.day + 1}`} ${formatHour(slot.startHour)}–${formatHour(slot.endHour)}`;

export const buildContext = (
  modules: SolverModule[],
  rooms: SolverRoom[],
  rules: TimetableRules = DEFAULT_RULES,
): TimetableContext => {
  const modulesByStudent = new Map<string, string[]>();
  for (const module of modules) {
    for (const studentId of new Set(module.studentIds)) {
      const list = modulesByStudent.get(studentId) ?? [];
      list.push(module.id);
      modulesByStudent.set(studentId, list);
    }
  }

  const sharedStudents = new Map<string, Set<string>>(modules.map((module) => [module.id, new Set<string>()]));
  for (const moduleIds of modulesByStudent.values()) {
    for (const a of moduleIds) {
      for (const b of moduleIds) {
        if (a !== b) sharedStudents.get(a)?.add(b);
      }
    }
  }

  return {
    rules,
    modules: new Map(modules.map((module) => [module.id, module])),
    rooms: new Map(rooms.map((room) => [room.id, room])),
    sharedStudents,
  };
};

const overlaps = (a: Slot, b: Slot) => a.day === b.day && a.startHour < b.endHour && b.startHour < a.endHour;
// Hours between two sessions on the same day; zero or less when they touch or overlap
const gapHours = (a: Slot, b: Slot) => Math.max(b.startHour - a.endHour, a.startHour - b.endHour);

export const slotFor = (module: SolverModule, day: number, startHour: number): Slot => ({
  day,
  startHour,
  endHour: startHour + module.durationHours,
});

// Rules that depend only on the time: teaching hours, the lecturer, and the students
export const timeClash = (
  ctx: TimetableContext,
  moduleId: string,
  slot: Slot,
  others: Placement[],
): Clash | null => {
  const module = ctx.modules.get(moduleId);
  if (!module) return { kind: "module", message: "This module no longer exists" };

  const { rules } = ctx;
  if (
    !Number.isInteger(slot.day) ||
    slot.day < 0 ||
    slot.day >= rules.days ||
    slot.startHour < rules.dayStartHour ||
    slot.endHour > rules.dayEndHour
  ) {
    return {
      kind: "hours",
      message: `Classes run ${formatHour(rules.dayStartHour)}–${formatHour(rules.dayEndHour)}, ${TEACHING_DAYS[0]} to ${TEACHING_DAYS[rules.days - 1]}`,
    };
  }

  const sameDaySessions = others.filter((p) => p.day === slot.day && ctx.modules.get(p.moduleId)?.lecturerId === module.lecturerId);
  if (sameDaySessions.length >= 2) {
    return {
      kind: "lecturer",
      message: `${module.lecturerName} can have at most 2 classes per day (already has ${sameDaySessions.length})`,
    };
  }

  const sharing = ctx.sharedStudents.get(moduleId);
  for (const other of others) {
    if (other.day !== slot.day) continue;
    const otherModule = ctx.modules.get(other.moduleId);
    if (!otherModule) continue;

    if (other.moduleId === moduleId && overlaps(slot, other)) {
      return { kind: "module", message: `${module.code} already has a session at ${formatSlot(other)}` };
    }

    if (otherModule.lecturerId === module.lecturerId && gapHours(slot, other) < rules.minLecturerGapHours) {
      return {
        kind: "lecturer",
        message: overlaps(slot, other)
          ? `${module.lecturerName} is already teaching ${otherModule.code} at ${formatSlot(other)}`
          : `${module.lecturerName} teaches ${otherModule.code} at ${formatSlot(other)}; classes on the same day need a ${rules.minLecturerGapHours}-hour break between them`,
      };
    }

    if (sharing?.has(other.moduleId) && overlaps(slot, other)) {
      return {
        kind: "students",
        message: `Students in ${module.code} also take ${otherModule.code}, which is on at ${formatSlot(other)}`,
      };
    }
  }
  return null;
};

// Rules that depend on the room: type, size, and whether it's free
export const roomClash = (
  ctx: TimetableContext,
  moduleId: string,
  roomId: string,
  slot: Slot,
  others: Placement[],
): Clash | null => {
  const module = ctx.modules.get(moduleId);
  if (!module) return { kind: "module", message: "This module no longer exists" };
  const room = ctx.rooms.get(roomId);
  if (!room) return { kind: "room", message: "This room no longer exists" };
  if (room.active === false) return { kind: "room", message: `${room.code} is no longer in use` };
  if (module.requiresComputers && !room.isComputerized) {
    return { kind: "room", message: `${module.code} needs a computer lab, and ${room.code} has no computers` };
  }

  if (module.preferredRoomType && module.preferredRoomType !== "any") {
    const roomTypeMatch = checkRoomTypePreference(module.preferredRoomType, room.roomType, room.isComputerized);
    if (!roomTypeMatch) {
      return {
        kind: "room",
        message: `${module.code} prefers ${module.preferredRoomType}, but ${room.code} is a ${room.roomType}`,
      };
    }
  }

  const size = new Set(module.studentIds).size;
  if (room.capacity < size) {
    return { kind: "room", message: `${room.code} seats ${room.capacity}, but ${module.code} has ${size} students` };
  }
  for (const other of others) {
    if (other.roomId === roomId && overlaps(slot, other)) {
      const otherCode = ctx.modules.get(other.moduleId)?.code ?? "another class";
      return { kind: "room", message: `${room.code} is already booked for ${otherCode} at ${formatSlot(other)}` };
    }
  }
  return null;
};

const checkRoomTypePreference = (preferred: string, roomType: string | undefined, isComputerized: boolean): boolean => {
  if (preferred === "computer lab") return isComputerized;
  if (preferred === "lecture theatre") return roomType === "lecture theatre";
  if (preferred === "30-seater") return roomType === "30-seater" || (!roomType && !isComputerized);
  return true;
};

export const checkPlacement = (ctx: TimetableContext, placement: Placement, others: Placement[]): Clash | null =>
  timeClash(ctx, placement.moduleId, placement, others) ?? roomClash(ctx, placement.moduleId, placement.roomId, placement, others);

// Rooms a module may use, best fit first: the right type, big enough, and the smallest that
// will do. Modules that don't need computers try ordinary rooms first so labs stay free.
export const suitableRooms = (module: SolverModule, rooms: SolverRoom[]): SolverRoom[] => {
  const size = new Set(module.studentIds).size;
  const passesRoomTypeCheck = (room: SolverRoom) => {
    if (module.preferredRoomType && module.preferredRoomType !== "any") {
      return checkRoomTypePreference(module.preferredRoomType, room.roomType, room.isComputerized);
    }
    return true;
  };

  return rooms
    .filter((room) => room.active !== false && room.capacity >= size && (!module.requiresComputers || room.isComputerized) && passesRoomTypeCheck(room))
    .sort(
      (a, b) =>
        Number(a.isComputerized) - Number(b.isComputerized) ||
        a.capacity - b.capacity ||
        a.code.localeCompare(b.code),
    );
};

// Small seeded generator, so the same data always produces the same timetable
const seededRandom = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

type Task = { module: SolverModule; session: number; batch: number; rooms: SolverRoom[] };

const unplaceableReason = (task: Task, rules: TimetableRules): string | null => {
  const { module, batch } = task;
  if (module.durationHours > rules.dayEndHour - rules.dayStartHour) {
    return `A ${module.durationHours}-hour session doesn't fit in the teaching day`;
  }
  if (task.rooms.length === 0) {
    const size = new Set(module.studentIds).size;
    return module.requiresComputers ? `No computer lab seats ${size} students` : `No room seats ${size} students`;
  }
  return null;
};

const noSlotReason = (task: Task, counts: Record<ClashKind, number>, rules: TimetableRules) => {
  const parts: string[] = [];
  if (counts.lecturer || counts.module) {
    parts.push(
      `${counts.lecturer + counts.module} clash with ${task.module.lecturerName}'s other classes or the ${rules.minLecturerGapHours}-hour break`,
    );
  }
  if (counts.students) parts.push(`${counts.students} clash with other modules its students take`);
  if (counts.room) {
    parts.push(`${counts.room} have no free ${task.module.requiresComputers ? "computer lab" : "room"} big enough`);
  }
  const batchInfo = task.module.batches > 1 ? ` (batch ${task.batch}/${task.module.batches})` : "";
  return `No time slot works for ${task.module.code}${batchInfo}: ${parts.join("; ")}`;
};

const placeAll = (ctx: TimetableContext, tasks: Task[], random: (() => number) | null): SolverResult => {
  const { rules } = ctx;
  const byDay: Placement[][] = Array.from({ length: rules.days }, () => []);
  const placements: Placement[] = [];
  const unplaced: UnplacedSession[] = [];

  for (const task of tasks) {
    const { module, batch } = task;
    const reason = unplaceableReason(task, rules);
    if (reason) {
      unplaced.push({ moduleId: module.id, session: task.session, batch, reason });
      continue;
    }

    // Spread a module's sessions over different days, keep each lecturer's days light,
    // and fill quiet hours first so rooms stay free for the modules that come later
    const candidates: Array<{ slot: Slot; score: number }> = [];
    for (let day = 0; day < rules.days; day += 1) {
      const sameDay = byDay[day] ?? [];
      const moduleThatDay = sameDay.some((p) => p.moduleId === module.id) ? 1 : 0;
      const lecturerThatDay = sameDay.filter((p) => ctx.modules.get(p.moduleId)?.lecturerId === module.lecturerId).length;
      for (let start = rules.dayStartHour; start + module.durationHours <= rules.dayEndHour; start += 1) {
        const slot = slotFor(module, day, start);
        const busy = sameDay.filter((p) => overlaps(slot, p)).length;
        const score =
          moduleThatDay * 1000 +
          lecturerThatDay * 20 +
          busy * 2 +
          sameDay.length * 0.5 +
          (start - rules.dayStartHour) * 0.01 +
          (random ? random() * 3 : 0);
        candidates.push({ slot, score });
      }
    }
    candidates.sort((a, b) => a.score - b.score);

    const counts: Record<ClashKind, number> = { hours: 0, module: 0, lecturer: 0, students: 0, room: 0 };
    let placed: Placement | null = null;
    for (const { slot } of candidates) {
      const sameDay = byDay[slot.day] ?? [];
      const clash = timeClash(ctx, module.id, slot, sameDay);
      if (clash) {
        counts[clash.kind] += 1;
        continue;
      }
      const room = task.rooms.find((candidate) => !roomClash(ctx, module.id, candidate.id, slot, sameDay));
      if (!room) {
        counts.room += 1;
        continue;
      }
      placed = { ...slot, moduleId: module.id, roomId: room.id, batch: task.batch };
      break;
    }

    if (placed) {
      placements.push(placed);
      byDay[placed.day]?.push(placed);
    } else {
      unplaced.push({ moduleId: module.id, session: task.session, batch: task.batch, reason: noSlotReason(task, counts, rules) });
    }
  }
  return { placements, unplaced };
};

export type GenerateOptions = {
  rules?: TimetableRules;
  // Extra passes with a shuffled order, kept only if they place more sessions
  attempts?: number;
  seed?: number;
  timeLimitMs?: number;
};

export const generateTimetable = (
  modules: SolverModule[],
  rooms: SolverRoom[],
  options: GenerateOptions = {},
): SolverResult => {
  const rules = options.rules ?? DEFAULT_RULES;
  const attempts = Math.max(1, options.attempts ?? 25);
  const deadline = Date.now() + (options.timeLimitMs ?? 10_000);
  const ctx = buildContext(modules, rooms, rules);

  const lecturerHours = new Map<string, number>();
  for (const module of modules) {
    lecturerHours.set(module.lecturerId, (lecturerHours.get(module.lecturerId) ?? 0) + module.sessionsPerWeek * module.durationHours);
  }

  // Hardest sessions first: computer labs, few usable rooms, many shared students, big
  // classes, busy lecturers. Ties break on the module code so results are repeatable.
  // Each batch gets its own session, so a module with 3 batches and 2 sessions/week = 6 tasks
  const tasks: Task[] = modules
    .flatMap((module) => {
      const usable = suitableRooms(module, rooms);
      const totalSessions = module.sessionsPerWeek * module.batches;
      return Array.from({ length: totalSessions }, (_, index) => {
        const batch = Math.floor(index / module.sessionsPerWeek) + 1;
        const sessionInBatch = (index % module.sessionsPerWeek) + 1;
        return { module, session: sessionInBatch, batch, rooms: usable };
      });
    })
    .sort(
      (a, b) =>
        Number(b.module.requiresComputers) - Number(a.module.requiresComputers) ||
        a.rooms.length - b.rooms.length ||
        (ctx.sharedStudents.get(b.module.id)?.size ?? 0) - (ctx.sharedStudents.get(a.module.id)?.size ?? 0) ||
        new Set(b.module.studentIds).size - new Set(a.module.studentIds).size ||
        (lecturerHours.get(b.module.lecturerId) ?? 0) - (lecturerHours.get(a.module.lecturerId) ?? 0) ||
        a.module.code.localeCompare(b.module.code) ||
        a.session - b.session,
    );

  let best = placeAll(ctx, tasks, null);
  const random = seededRandom(options.seed ?? 1);
  const spread = Math.max(4, Math.ceil(tasks.length / 5));
  for (let attempt = 1; attempt < attempts && best.unplaced.length > 0 && Date.now() < deadline; attempt += 1) {
    const shuffled = tasks
      .map((task, index) => ({ task, key: index + (random() - 0.5) * spread }))
      .sort((a, b) => a.key - b.key)
      .map(({ task }) => task);
    const result = placeAll(ctx, shuffled, random);
    if (result.unplaced.length < best.unplaced.length) best = result;
  }
  return best;
};
