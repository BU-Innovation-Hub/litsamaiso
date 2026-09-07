import test from "node:test";
import assert from "node:assert/strict";
import { normalizeAccountStatus } from "./accountService.js";

test("Finance clearance statuses retain existing normalization rules", () => {
  assert.equal(normalizeAccountStatus("confirmed"), "confirmed");
  assert.equal(normalizeAccountStatus("paid"), "paid");
  assert.equal(normalizeAccountStatus("unknown value"), "pending");
});
