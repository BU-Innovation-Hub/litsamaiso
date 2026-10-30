import test, { afterEach, before } from "node:test";
import assert from "node:assert/strict";
import type { Request, Response } from "express";
import bcrypt from "bcryptjs";

import { AuditLog } from "../models/AuditLog.js";
import { Institution } from "../models/Institution.js";
import { Role } from "../models/Role.js";
import { Student } from "../models/Student.js";
import { User } from "../models/User.js";
import { login, register, requestPasswordReset, resetPassword } from "./authController.js";

const realCreate = AuditLog.create;
const realFindOne = User.findOne;
const realUserCreate = User.create;
const realRoleFindOne = Role.findOne;
const realStudentFindOne = Student.findOne;
const realInstitutionFindById = Institution.findById;
let recorded: Array<Record<string, any>> = [];

before(() => {
  process.env.JWT_SECRET = "test-secret";
  process.env.JWT_EXPIRES_IN = "1h";
});

afterEach(() => {
  AuditLog.create = realCreate;
  User.findOne = realFindOne;
  User.create = realUserCreate;
  Role.findOne = realRoleFindOne;
  Student.findOne = realStudentFindOne;
  Institution.findById = realInstitutionFindById;
});

// Captures audit entries instead of writing them, and makes User.findOne return `user`
const stub = (user: unknown) => {
  recorded = [];
  AuditLog.create = (async (payload: Record<string, any>) => {
    recorded.push(payload);
  }) as any;
  // A query that can be chained and then awaited, like Mongoose's
  const query: any = {
    select: () => query,
    populate: () => query,
    then: (resolve: any, reject: any) => Promise.resolve(user).then(resolve, reject),
  };
  User.findOne = (() => query) as any;
};

const call = async (handler: (req: Request, res: Response) => Promise<void>, body: unknown) => {
  let statusCode = 200;
  const req = { body, get: () => undefined } as unknown as Request;
  const res = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json() {
      return this;
    },
  } as unknown as Response;
  await handler(req, res);
  return statusCode;
};

const student = async (overrides: Record<string, unknown> = {}) => ({
  _id: "user-1",
  email: "student@example.com",
  password: await bcrypt.hash("right-password", 4),
  role: { name: "Student" },
  institution: { locked: false },
  ...overrides,
});

// A student registering with a matching record at `institution`; returns what was saved and answered
const callRegister = async (institution: Record<string, unknown>, body: Record<string, unknown> = {}) => {
  stub(null);
  const created: Array<Record<string, any>> = [];
  User.create = (async (data: Record<string, any>) => {
    created.push(data);
    return { _id: "user-1", ...data };
  }) as any;
  Role.findOne = (async () => ({ _id: "role-1", name: "Student" })) as any;
  Student.findOne = (() => ({
    lean: async () => ({ studentId: "2024001", email: "student@example.com", institution: "institution-1" }),
  })) as any;
  Institution.findById = (async () => ({ _id: "institution-1", ...institution })) as any;

  let statusCode = 200;
  let payload: any;
  const req = {
    body: {
      email: "student@example.com",
      password: "right-password",
      role: "Student",
      studentId: "2024001",
      financialInfoConsent: true,
      ...body,
    },
    get: () => undefined,
  } as unknown as Request;
  const res = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(value: unknown) {
      payload = value;
      return this;
    },
  } as unknown as Response;
  await register(req, res);
  return { statusCode, payload, created };
};

test("with the authenticator off a student registers with no code and no authenticator fields", async () => {
  const { statusCode, created } = await callRegister({ totpRequired: false });
  assert.equal(statusCode, 201);
  assert.equal(created.length, 1);
  assert.equal(created[0]?.totpSecretEncrypted, undefined);
  assert.equal(created[0]?.totpEnabledAt, undefined);
});

test("with the authenticator off a stale setup sent with the registration is ignored", async () => {
  const { statusCode, created } = await callRegister(
    { totpRequired: false },
    { totpEnrollmentToken: "stale-token", totpCode: "000000" },
  );
  assert.equal(statusCode, 201);
  assert.equal(created[0]?.totpSecretEncrypted, undefined);
});

test("with the authenticator on, or never set, a student with no code is asked for one", async () => {
  for (const institution of [{ totpRequired: true }, {}]) {
    const { statusCode, payload, created } = await callRegister(institution);
    assert.equal(statusCode, 400, JSON.stringify(institution));
    assert.equal(payload.code, "TOTP_REQUIRED");
    assert.equal(created.length, 0);
  }
});

test("a student's details are checked before the authenticator is asked for", async () => {
  const { statusCode, payload } = await callRegister({ totpRequired: true }, { email: "other@example.com" });
  assert.equal(statusCode, 400);
  assert.notEqual(payload.code, "TOTP_REQUIRED");
});

test("a successful login is audited", async () => {
  stub(await student());
  assert.equal(await call(login, { email: "student@example.com", password: "right-password" }), 200);
  assert.deepEqual(
    recorded.map((entry) => [entry.action, entry.actorId, entry.actorRole]),
    [["auth.login", "user-1", "Student"]],
  );
});

test("each kind of failed login is audited with its reason", async () => {
  stub(null);
  assert.equal(await call(login, { email: "nobody@example.com", password: "guess" }), 401);
  assert.equal(recorded[0]?.action, "auth.login.failed");
  assert.deepEqual(recorded[0]?.details, { identifier: "nobody@example.com", reason: "unknown_account" });
  assert.equal(recorded[0]?.actorId, undefined);

  stub(await student());
  assert.equal(await call(login, { studentId: "2024001", password: "wrong-password" }), 401);
  assert.deepEqual(recorded[0]?.details, { identifier: "2024001", reason: "wrong_password" });
  assert.equal(recorded[0]?.actorId, "user-1");

  stub(await student({ institution: { locked: true } }));
  assert.equal(await call(login, { email: "student@example.com", password: "right-password" }), 403);
  assert.deepEqual(recorded[0]?.details, { identifier: "student@example.com", reason: "institution_locked" });
});

test("password reset requests and failed resets are audited", async () => {
  stub(null);
  await call(requestPasswordReset, { email: "Nobody@Example.com" });
  assert.equal(recorded[0]?.action, "auth.passwordReset.request");
  assert.deepEqual(recorded[0]?.details, { email: "nobody@example.com", accountFound: false });

  stub(null);
  assert.equal(await call(resetPassword, { email: "a@example.com", token: "bad", password: "new-password" }), 400);
  assert.equal(recorded[0]?.action, "auth.passwordReset.failed");
  assert.deepEqual(recorded[0]?.details, { email: "a@example.com", reason: "invalid_or_expired_token" });
});
