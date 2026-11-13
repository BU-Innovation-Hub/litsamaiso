import assert from "node:assert/strict";
import test from "node:test";
import {
  buildContext,
  checkPlacement,
  DEFAULT_RULES,
  generateTimetable,
  roomClash,
  slotFor,
  timeClash,
  type Placement,
  type SolverModule,
  type SolverRoom,
  type TimetableContext,
} from "./timetableSolver.js";

const students = (prefix: string, count: number) => Array.from({ length: count }, (_, i) => `${prefix}${i}`);

const module = (overrides: Partial<SolverModule> & Pick<SolverModule, "id">): SolverModule => ({
  code: overrides.id.toUpperCase(),
  lecturerId: `lecturer-${overrides.id}`,
  lecturerName: `Lecturer ${overrides.id}`,
  studentIds: students(overrides.id, 20),
  requiresComputers: false,
  sessionsPerWeek: 1,
  durationHours: 2,
  ...overrides,
});

const room = (overrides: Partial<SolverRoom> & Pick<SolverRoom, "id">): SolverRoom => ({
  code: overrides.id.toUpperCase(),
  capacity: 50,
  isComputerized: false,
  ...overrides,
});

// Every placement must pass the same check Registry's manual moves go through
const assertNoRuleBroken = (ctx: TimetableContext, placements: Placement[]) => {
  placements.forEach((placement, index) => {
    const others = placements.filter((_, otherIndex) => otherIndex !== index);
    assert.equal(checkPlacement(ctx, placement, others), null, JSON.stringify(placement));
  });
};

test("two classes never share a room at the same time", () => {
  const modules = [module({ id: "a" }), module({ id: "b" }), module({ id: "c" })];
  const rooms = [room({ id: "r1" })];
  const result = generateTimetable(modules, rooms);
  assert.equal(result.unplaced.length, 0);
  assertNoRuleBroken(buildContext(modules, rooms), result.placements);
});

test("modules that share students are never on at the same time", () => {
  const shared = students("shared", 5);
  const modules = [
    module({ id: "a", studentIds: [...shared, ...students("a", 10)] }),
    module({ id: "b", studentIds: [...shared, ...students("b", 10)] }),
  ];
  // One day with room for both, so only the student rule keeps them apart
  const rules = { ...DEFAULT_RULES, days: 1 };
  const rooms = [room({ id: "r1" }), room({ id: "r2" })];
  const result = generateTimetable(modules, rooms, { rules });
  assert.equal(result.unplaced.length, 0);
  const [first, second] = result.placements;
  assert.ok(first && second);
  assert.ok(first.endHour <= second.startHour || second.endHour <= first.startHour);
});

test("a lecturer gets at least two hours between classes on the same day", () => {
  const lecturer = { lecturerId: "l1", lecturerName: "Dr Mokoena" };
  const modules = ["a", "b", "c", "d"].map((id) => module({ id, ...lecturer }));
  const rooms = [room({ id: "r1" }), room({ id: "r2" })];
  // One 07:00–19:00 day fits three 2-hour classes with 2-hour breaks: 07–09, 11–13, 15–17
  const rules = { ...DEFAULT_RULES, days: 1 };
  const result = generateTimetable(modules, rooms, { rules });

  assert.equal(result.placements.length, 3);
  const sorted = [...result.placements].sort((a, b) => a.startHour - b.startHour);
  for (let i = 1; i < sorted.length; i += 1) {
    assert.ok(sorted[i]!.startHour - sorted[i - 1]!.endHour >= 2);
  }
  assert.equal(result.unplaced.length, 1);
  assert.match(result.unplaced[0]!.reason, /Dr Mokoena's other classes or the 2-hour break/);
});

test("a lecturer's classes on different days need no break", () => {
  const lecturer = { lecturerId: "l1", lecturerName: "Dr Mokoena" };
  const modules = [module({ id: "a", ...lecturer }), module({ id: "b", ...lecturer })];
  const ctx = buildContext(modules, [room({ id: "r1" })]);
  const monday: Placement = { ...slotFor(modules[0]!, 0, 7), moduleId: "a", roomId: "r1" };
  assert.equal(timeClash(ctx, "b", slotFor(modules[1]!, 1, 9), [monday]), null);
});

test("moving a class too close to the lecturer's other class is refused", () => {
  const lecturer = { lecturerId: "l1", lecturerName: "Dr Mokoena" };
  const modules = [module({ id: "a", ...lecturer }), module({ id: "b", ...lecturer })];
  const ctx = buildContext(modules, [room({ id: "r1" }), room({ id: "r2" })]);
  const existing: Placement = { ...slotFor(modules[0]!, 0, 7), moduleId: "a", roomId: "r1" };

  // Ends 09:00, so 10:00 is only one hour later
  const tooSoon = timeClash(ctx, "b", slotFor(modules[1]!, 0, 10), [existing]);
  assert.equal(tooSoon?.kind, "lecturer");
  assert.match(tooSoon!.message, /2-hour break/);

  assert.equal(timeClash(ctx, "b", slotFor(modules[1]!, 0, 11), [existing]), null);
});

test("moving a class into a booked room is refused", () => {
  const modules = [module({ id: "a" }), module({ id: "b" })];
  const ctx = buildContext(modules, [room({ id: "r1" })]);
  const existing: Placement = { ...slotFor(modules[0]!, 2, 9), moduleId: "a", roomId: "r1" };
  const clash = roomClash(ctx, "b", "r1", slotFor(modules[1]!, 2, 10), [existing]);
  assert.equal(clash?.kind, "room");
  assert.match(clash!.message, /R1 is already booked for A/);
});

test("classes stay between 07:00 and 19:00, Monday to Saturday", () => {
  const modules = [module({ id: "a" })];
  const ctx = buildContext(modules, [room({ id: "r1" })]);
  assert.equal(timeClash(ctx, "a", slotFor(modules[0]!, 0, 6), [])?.kind, "hours");
  assert.equal(timeClash(ctx, "a", slotFor(modules[0]!, 0, 18), [])?.kind, "hours");
  assert.equal(timeClash(ctx, "a", slotFor(modules[0]!, 0, 17), []), null);
  assert.equal(DEFAULT_RULES.days, 6);
  assert.equal(timeClash(ctx, "a", slotFor(modules[0]!, 5, 9), []), null);
  const sunday = timeClash(ctx, "a", slotFor(modules[0]!, 6, 9), []);
  assert.equal(sunday?.kind, "hours");
  assert.match(sunday?.message ?? "", /Monday to Saturday/);
});

test("modules that need computers only go in computer labs", () => {
  const modules = [module({ id: "prog", requiresComputers: true })];
  const rooms = [room({ id: "hall", capacity: 200 }), room({ id: "lab", capacity: 30, isComputerized: true })];
  const result = generateTimetable(modules, rooms);
  assert.equal(result.placements[0]?.roomId, "lab");
});

test("a module that needs computers is reported when no lab is big enough", () => {
  const modules = [module({ id: "prog", requiresComputers: true, studentIds: students("p", 40) })];
  const rooms = [room({ id: "hall", capacity: 200 }), room({ id: "lab", capacity: 30, isComputerized: true })];
  const result = generateTimetable(modules, rooms);
  assert.equal(result.placements.length, 0);
  assert.equal(result.unplaced[0]?.reason, "No computer lab seats 40 students");
});

test("modules that don't need computers leave the labs free", () => {
  const modules = [module({ id: "law" })];
  const rooms = [room({ id: "lab", capacity: 30, isComputerized: true }), room({ id: "room", capacity: 100 })];
  const result = generateTimetable(modules, rooms);
  assert.equal(result.placements[0]?.roomId, "room");
});

test("a class goes in the smallest room that seats everyone", () => {
  const modules = [module({ id: "a", studentIds: students("a", 50) })];
  const rooms = [room({ id: "small", capacity: 30 }), room({ id: "big", capacity: 200 }), room({ id: "fit", capacity: 60 })];
  const result = generateTimetable(modules, rooms);
  assert.equal(result.placements[0]?.roomId, "fit");
});

test("a module's weekly sessions go on different days", () => {
  const modules = [module({ id: "a", sessionsPerWeek: 3 })];
  const result = generateTimetable(modules, [room({ id: "r1" })]);
  assert.equal(result.placements.length, 3);
  assert.equal(new Set(result.placements.map((p) => p.day)).size, 3);
});

test("rooms that are no longer in use are skipped", () => {
  const modules = [module({ id: "a" })];
  const rooms = [room({ id: "closed", active: false }), room({ id: "open" })];
  const result = generateTimetable(modules, rooms);
  assert.equal(result.placements[0]?.roomId, "open");
});

test("the same data always gives the same timetable", () => {
  const modules = ["a", "b", "c", "d", "e"].map((id) => module({ id, sessionsPerWeek: 2, lecturerId: id < "c" ? "l1" : "l2" }));
  const rooms = [room({ id: "r1" }), room({ id: "r2" })];
  assert.deepEqual(generateTimetable(modules, rooms), generateTimetable(modules, rooms));
});

test("a busy week for a whole faculty is placed without breaking a rule", () => {
  let seed = 42;
  const random = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  // 40 programme-year cohorts taking six modules each, lecturers teaching three modules,
  // and a few students repeating a module from another cohort
  const modules: SolverModule[] = [];
  for (let cohort = 0; cohort < 40; cohort += 1) {
    const cohortStudents = students(`c${cohort}-`, 20 + Math.floor(random() * 60));
    for (let i = 0; i < 6; i += 1) {
      const index = modules.length;
      const repeaters = cohort > 0 && i === 1 ? students(`c${cohort - 1}-`, 3) : [];
      modules.push(
        module({
          id: `m${index}`,
          lecturerId: `l${Math.floor(index / 3)}`,
          lecturerName: `Lecturer ${Math.floor(index / 3)}`,
          studentIds: [...cohortStudents, ...repeaters],
          requiresComputers: i === 0,
          sessionsPerWeek: 1 + (index % 3),
          durationHours: 1 + (index % 2),
        }),
      );
    }
  }
  const rooms = Array.from({ length: 30 }, (_, i) =>
    room({ id: `r${i}`, capacity: 40 + (i % 5) * 15, isComputerized: i < 8 }),
  );

  const result = generateTimetable(modules, rooms);
  assert.equal(result.unplaced.length, 0, JSON.stringify(result.unplaced.slice(0, 3)));
  assertNoRuleBroken(buildContext(modules, rooms), result.placements);
  const sessions = modules.reduce((total, m) => total + m.sessionsPerWeek, 0);
  assert.equal(result.placements.length, sessions);
});
