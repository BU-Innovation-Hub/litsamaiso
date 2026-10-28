import test, { afterEach, before, mock } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";

import { requireAuth, requireRole } from "./authMiddleware.js";
import { User } from "../models/User.js";
import { activeRoleName, heldRoleNames } from "../utils/activeRole.js";
import { auditActor } from "../utils/auditLog.js";

const studentOnIec = () => ({
  _id: "user-1",
  email: "iec@example.com",
  role: { _id: "role-student", name: "student" },
  additionalRoles: [{ _id: "role-iec", name: "IEC" }],
  $locals: {} as Record<string, unknown>,
});

// Stands in for the User.findById(...).populate(...).populate(...) query
const resolvesTo = (user: unknown) => {
  const query = {
    populate: () => query,
    then: (resolve: (value: unknown) => void) => resolve(user),
  };
  return query;
};

const run = async (headers: Record<string, string>, user: unknown) => {
  mock.method(User, "findById", () => resolvesTo(user));
  const req: any = { headers: { authorization: `Bearer ${jwt.sign({ sub: "user-1" }, "test-secret")}`, ...headers } };
  let status = 200;
  let body: any;
  const res: any = {
    status: (code: number) => {
      status = code;
      return res;
    },
    json: (payload: unknown) => {
      body = payload;
      return res;
    },
  };
  let passed = false;
  await requireAuth(req, res, () => {
    passed = true;
  });
  return { req, status, body, passed };
};

const allows = (roles: string[], user: unknown) => {
  let passed = false;
  let status = 200;
  const res: any = { status: (code: number) => ((status = code), res), json: () => res };
  requireRole(roles)({ user } as any, res, () => {
    passed = true;
  });
  return { passed, status };
};

before(() => {
  process.env.JWT_SECRET = "test-secret";
});

afterEach(() => {
  mock.restoreAll();
});

test("without the header a user acts as their primary role", async () => {
  const { req, passed } = await run({}, studentOnIec());
  assert.equal(passed, true);
  assert.equal(activeRoleName(req.user), "student");
  assert.equal(allows(["SAAD", "IEC"], req.user).status, 403);
  assert.equal(allows(["Student"], req.user).passed, true);
});

test("a student on the IEC can act as IEC, and is then authorised like SAAD", async () => {
  const { req, passed } = await run({ "x-active-role": "iec" }, studentOnIec());
  assert.equal(passed, true);
  assert.equal(activeRoleName(req.user), "IEC");
  assert.equal(allows(["SAAD", "IEC"], req.user).passed, true);
  // In IEC mode they aren't a student, so student-only routes such as voting refuse them
  assert.equal(allows(["Student"], req.user).status, 403);
  // The primary role on the document is untouched, so saving the user can't store IEC
  assert.equal(req.user.role.name, "student");
});

test("asking for the primary role by name is the same as no header", async () => {
  const { req, passed } = await run({ "x-active-role": "Student" }, studentOnIec());
  assert.equal(passed, true);
  assert.equal(activeRoleName(req.user), "student");
});

test("a role the user doesn't hold is refused, not quietly ignored", async () => {
  const student = { ...studentOnIec(), additionalRoles: [] };
  for (const role of ["IEC", "SAAD", "AppAdmin"]) {
    const { status, body, passed } = await run({ "x-active-role": role }, student);
    assert.equal(passed, false, role);
    assert.equal(status, 403, role);
    assert.equal(body.code, "ACTIVE_ROLE_NOT_HELD", role);
  }
});

test("SAAD is still authorised on election management exactly as before", () => {
  const saad = { role: { name: "SAAD" }, additionalRoles: [], $locals: {} };
  assert.equal(allows(["SAAD", "IEC"], saad).passed, true);
  assert.equal(allows(["SAAD", "IEC", "Student"], saad).passed, true);
  assert.equal(allows(["Student"], saad).status, 403);
});

test("heldRoleNames lists the primary role first and ignores unpopulated ids", () => {
  assert.deepEqual(heldRoleNames(studentOnIec()), ["student", "IEC"]);
  assert.deepEqual(heldRoleNames({ role: { name: "SAAD" } }), ["SAAD"]);
  assert.deepEqual(heldRoleNames({ role: { name: "student" }, additionalRoles: ["65f0c0ffee"] }), ["student"]);
});

test("auditActor records the role an action was taken under", () => {
  const user = studentOnIec();
  assert.equal(auditActor(user).actorRole, "student");
  user.$locals.activeRole = "IEC";
  assert.equal(auditActor(user).actorRole, "IEC");
});
