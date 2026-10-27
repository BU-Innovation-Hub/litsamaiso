import test from "node:test";
import assert from "node:assert/strict";

import { isLateBallot } from "./voteService.js";
import { LATE_BALLOT_GRACE_MS } from "./electionScheduler.js";

const endTime = new Date("2026-10-27T12:00:00Z");
const closed = { status: "CLOSED", endTime };
const at = (offsetMs: number) => new Date(endTime.getTime() + offsetMs);

test("a ballot opened before close is accepted during the grace period", () => {
  assert.equal(isLateBallot(closed, at(-5 * 60 * 1000), at(5_000)), true);
  assert.equal(isLateBallot(closed, at(-1_000), at(LATE_BALLOT_GRACE_MS)), true);
});

test("a late ballot is refused once the grace period is over", () => {
  assert.equal(isLateBallot(closed, at(-5 * 60 * 1000), at(LATE_BALLOT_GRACE_MS + 1)), false);
});

test("a ballot opened at or after close is never late, only shut out", () => {
  assert.equal(isLateBallot(closed, at(0), at(1_000)), false);
  assert.equal(isLateBallot(closed, at(2_000), at(3_000)), false);
  assert.equal(isLateBallot(closed, undefined, at(1_000)), false);
});

test("only a closed election takes late ballots", () => {
  for (const status of ["OPEN", "COUNTING", "RESULTS_PUBLISHED", "ARCHIVED"]) {
    assert.equal(isLateBallot({ status, endTime }, at(-60_000), at(1_000)), false, status);
  }
  assert.equal(isLateBallot({ status: "CLOSED" }, at(-60_000), at(1_000)), false);
});
