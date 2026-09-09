import test from "node:test";
import assert from "node:assert/strict";
import { borrowerConflictMessage, canReuseCompletedRetry, hasUnresolvedStudentConflict, missingStudentFields, missingStudentMatchMessage, normalizeNationalId, reconcileImportCounts } from "./registryService.js";

test("normalizes National IDs consistently for Registry and Finance matching", () => {
  assert.equal(normalizeNationalId(" ab-123 45 "), "AB12345");
  assert.equal(normalizeNationalId(""), "");
});

test("Registry terminal counters reconcile every row exactly once", () => {
  const counts = reconcileImportCounts([
    { outcome: "inserted" },
    { outcome: "updated" },
    { outcome: "skipped" },
    { outcome: "error" },
    { outcome: "pending" },
  ]);

  assert.deepEqual(counts, { total: 5, processed: 4, inserted: 1, updated: 1, skipped: 1, errors: 1 });
  assert.equal(counts.processed, counts.inserted + counts.updated + counts.skipped + counts.errors);
});

test("a student row cannot be created without all required identifiers", () => {
  assert.deepEqual(missingStudentFields({ name: "Ada", surname: "Lovelace", email: "", studentId: "S-1", nationalId: "" }), ["email", "nationalId"]);
  assert.deepEqual(missingStudentFields({ name: "Ada", surname: "Lovelace", email: "ada@example.test", studentId: "S-1", nationalId: "ID-1" }), []);
});

test("an unresolved conflict for the same imported student blocks creation", () => {
  const row = { studentId: "S-1", email: "ada@example.test", nationalId: "ID-1", classification: "missing/unmatched" as const };
  const unresolved = { studentId: "S-1", email: "ada@example.test", nationalId: "ID-1", classification: "conflict" as const, exceptionStatus: "open" as const };
  assert.equal(hasUnresolvedStudentConflict({ rows: [row, unresolved] }, row), true);
  assert.equal(hasUnresolvedStudentConflict({ rows: [row, { ...unresolved, classification: "matched", exceptionStatus: null }] }, row), false);
});

test("a completed student row is not blocked by unrelated conflicts", () => {
  const row = { studentId: "S-1", email: "ada@example.test", nationalId: "ID-1", classification: "missing/unmatched" as const };
  const unrelated = { studentId: "S-2", email: "grace@example.test", nationalId: "ID-2", classification: "conflict" as const, exceptionStatus: "open" as const };
  assert.equal(hasUnresolvedStudentConflict({ rows: [row, unrelated] }, row), false);
});

test("replaying the same completed save is idempotent, but a different edit is not reused", () => {
  const completed = { outcome: "inserted" as const, studentId: "S-1", email: "ada@example.test", nationalId: "ID-1", name: "Ada", surname: "Lovelace" };
  assert.equal(canReuseCompletedRetry(completed, { studentId: "S-1", email: "ADA@EXAMPLE.TEST", nationalId: "id-1", name: "Ada" }), true);
  assert.equal(canReuseCompletedRetry(completed, { studentId: "S-1", email: "other@example.test" }), false);
  assert.equal(canReuseCompletedRetry(completed), true);
});

test("Registry conflict messages identify the exact values that need correction", () => {
  assert.equal(
    borrowerConflictMessage("SS", { studentId: "2603235" }),
    'Borrower number "SS" is already assigned to another student. Student ID "2603235" already owns it.',
  );
  assert.equal(
    missingStudentMatchMessage({ studentId: "2603235", email: "student@example.com", nationalId: "123456789" }),
    'No registered student matches Student ID "2603235", email "student@example.com", National ID "123456789". Verify these values before saving.',
  );
});
