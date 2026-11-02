import assert from "node:assert/strict";
import test from "node:test";
import { Types } from "mongoose";
import { Election } from "../models/Election.js";
import AppError from "./errors.js";
import { requireAcademicYear } from "./validation.js";

test("an academic year written as two consecutive years is accepted", () => {
  assert.equal(requireAcademicYear("2026/2027"), "2026/2027");
  assert.equal(requireAcademicYear("  2026/2027 "), "2026/2027");
});

for (const value of ["2026-2027", "2026 to 2027", "2026", "26/27", "2026/2028", "2027/2026", "2026/2026", "2026/ 2027", "x2026/2027"]) {
  test(`the academic year ${JSON.stringify(value)} is blocked`, () => {
    assert.throws(() => requireAcademicYear(value), (error: unknown) => error instanceof AppError && /2026\/2027/.test(error.message));
  });
}

for (const value of [undefined, null, "", "   "]) {
  test(`an academic year of ${JSON.stringify(value)} is reported as missing`, () => {
    assert.throws(() => requireAcademicYear(value), /Academic year is required/);
  });
}

const election = (academicYear?: string) =>
  new Election({
    title: "SRC Elections",
    createdBy: new Types.ObjectId(),
    institution: new Types.ObjectId(),
    ...(academicYear !== undefined && { academicYear }),
  });

test("the database refuses an election with a badly written academic year", () => {
  assert.ok(election("2026-2027").validateSync()?.errors.academicYear);
});

test("the database accepts a well written academic year", () => {
  assert.equal(election("2026/2027").validateSync(), undefined);
});

test("an older election with no academic year still passes the database check", () => {
  assert.equal(election().validateSync(), undefined);
});
