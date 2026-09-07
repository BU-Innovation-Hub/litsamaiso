import test from "node:test";
import assert from "node:assert/strict";
import { normalizeNationalId, reconcileImportCounts } from "./registryService.js";

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
