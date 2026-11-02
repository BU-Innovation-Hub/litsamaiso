import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { Types } from "mongoose";
import { Election } from "../models/Election.js";
import { createElection, updateElection } from "./electionService.js";

const realCreate = Election.create;
const realFindOne = Election.findOne;

afterEach(() => {
  Election.create = realCreate;
  Election.findOne = realFindOne;
});

const user = { _id: new Types.ObjectId(), institution: new Types.ObjectId() };

const failIfCreated = () => {
  Election.create = (() => assert.fail("nothing should be saved")) as unknown as typeof Election.create;
};

const draftElection = () => {
  const election = { status: "DRAFT", academicYear: "2026/2027", save: () => assert.fail("nothing should be saved") };
  Election.findOne = (async () => election) as unknown as typeof Election.findOne;
  return election;
};

for (const academicYear of ["2026-2027", "2026 to 2027", "2026/2028"]) {
  test(`creating an election with the academic year ${academicYear} is blocked`, async () => {
    failIfCreated();
    await assert.rejects(createElection({ user, title: "SRC Elections", academicYear }), /2026\/2027/);
  });

  test(`changing an election's academic year to ${academicYear} is blocked`, async () => {
    const election = draftElection();
    await assert.rejects(
      updateElection({ user, electionId: String(new Types.ObjectId()), updates: { academicYear } }),
      /2026\/2027/,
    );
    assert.equal(election.academicYear, "2026/2027");
  });
}

test("creating an election with no academic year is blocked", async () => {
  failIfCreated();
  await assert.rejects(createElection({ user, title: "SRC Elections" }), /Academic year is required/);
});

test("clearing an election's academic year is blocked", async () => {
  draftElection();
  await assert.rejects(
    updateElection({ user, electionId: String(new Types.ObjectId()), updates: { academicYear: "" } }),
    /Academic year is required/,
  );
});
