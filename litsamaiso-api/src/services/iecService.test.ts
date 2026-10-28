import test, { afterEach, mock } from "node:test";
import assert from "node:assert/strict";

import { ensureNotIecMember, iecStudentIds } from "./iecService.js";
import { Role } from "../models/Role.js";
import { User } from "../models/User.js";

// Stands in for a Mongoose query that ends in .lean()
const leanResult = (value: unknown) => {
  const query = { select: () => query, lean: async () => value };
  return query;
};

const withIecMembers = (studentIds: string[]) => {
  mock.method(Role, "findOne", () => leanResult({ _id: "role-iec" }));
  mock.method(User, "find", (filter: any) => {
    const wanted: string[] = filter.studentId.$in;
    return leanResult(studentIds.filter((id) => wanted.includes(id)).map((studentId) => ({ studentId })));
  });
};

afterEach(() => {
  mock.restoreAll();
});

test("an IEC member can't be made a candidate", async () => {
  withIecMembers(["2024001"]);
  await assert.rejects(ensureNotIecMember("inst-1", "2024001"), (err: any) => {
    assert.equal(err.statusCode, 400);
    assert.match(err.message, /on the IEC and cannot stand as a candidate/);
    return true;
  });
});

test("a student who isn't on the IEC can be made a candidate", async () => {
  withIecMembers(["2024001"]);
  await ensureNotIecMember("inst-1", "2024999");
});

test("iecStudentIds picks out only the IEC members from a candidate import", async () => {
  withIecMembers(["2024001", "2024003"]);
  const members = await iecStudentIds("inst-1", ["2024001", "2024002", "2024003"]);
  assert.deepEqual([...members].sort(), ["2024001", "2024003"]);
});

test("iecStudentIds doesn't query when there's nothing to check", async () => {
  const find = mock.method(User, "find", () => leanResult([]));
  assert.equal((await iecStudentIds("inst-1", [])).size, 0);
  assert.equal(find.mock.callCount(), 0);
});
