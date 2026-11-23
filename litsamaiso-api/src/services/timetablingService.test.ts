import assert from "node:assert/strict";
import test from "node:test";
import { sessionView, waitingEntry } from "./timetablingService.js";

test("a timetabled class carries its batch, its lecturer from the module and its room type", () => {
  const module = { _id: "m1", code: "CSC101", name: "Programming", requiresComputers: true, students: ["s1", "s2"], lecturer: { _id: "l1", name: "Lineo Mohapi" } };
  const room = { _id: "r1", code: "CL1", building: "ICT Centre", capacity: 40, isComputerized: true, roomType: "computer lab", active: true };
  const view = sessionView({ _id: "c1", day: 0, startHour: 7, endHour: 9, batch: 2 }, module, room);
  assert.equal(view.batch, 2);
  assert.deepEqual(view.lecturer, { _id: "l1", name: "Lineo Mohapi" });
  assert.equal(view.module?.studentCount, 2);
  assert.equal(view.room?.roomType, "computer lab");
  assert.ok(!("active" in view.room!), "only what the timetable shows");
});

test("a class whose module or room was deleted still shows, and an old class without a batch is batch 1", () => {
  const view = sessionView({ _id: "c1", day: 1, startHour: 8, endHour: 10 }, undefined, undefined);
  assert.equal(view.batch, 1);
  assert.equal(view.module, null);
  assert.equal(view.lecturer, null);
  assert.equal(view.room, null);
});

test("each waiting batch is kept apart, so placing one doesn't place another", () => {
  const codes = new Map([["m1", "CSC101"]]);
  const first = waitingEntry({ moduleId: "m1", session: 1, batch: 1, reason: "No room" }, codes);
  const second = waitingEntry({ moduleId: "m1", session: 1, batch: 2, reason: "No room" }, codes);
  assert.deepEqual(second, { module: "m1", moduleCode: "CSC101", session: 1, batch: 2, reason: "No room" });
  assert.notDeepEqual(first, second);
  assert.equal(waitingEntry({ moduleId: "gone", session: 1, batch: 1, reason: "x" }, codes).moduleCode, "");
});
