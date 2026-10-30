import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import type { Request, Response } from "express";

import { AuditLog } from "../models/AuditLog.js";
import { Institution } from "../models/Institution.js";
import { setInstitutionTotp } from "./institutionController.js";

const realCreate = AuditLog.create;
const realFindById = Institution.findById;
let recorded: Array<Record<string, any>> = [];

afterEach(() => {
  AuditLog.create = realCreate;
  Institution.findById = realFindById;
});

// Captures audit entries instead of writing them, and makes Institution.findById return `institution`
const stub = (institution: unknown) => {
  recorded = [];
  AuditLog.create = (async (payload: Record<string, any>) => {
    recorded.push(payload);
  }) as any;
  Institution.findById = (async () => institution) as any;
};

const institutionWith = (fields: Record<string, unknown> = {}) => {
  const institution = {
    _id: "institution-1",
    name: "Botho University",
    saves: 0,
    async save() {
      institution.saves += 1;
    },
    ...fields,
  };
  return institution as typeof institution & { totpRequired?: boolean };
};

const appAdmin = { _id: "admin-1", email: "admin@example.com", role: { name: "AppAdmin" } };

const call = async (body: unknown, user: unknown = appAdmin) => {
  let statusCode = 200;
  let payload: any;
  const req = { body, params: { id: "institution-1" }, user, get: () => undefined } as unknown as Request;
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
  await setInstitutionTotp(req, res);
  return { statusCode, payload };
};

test("turning the authenticator off saves the setting and is audited", async () => {
  const institution = institutionWith({ totpRequired: true });
  stub(institution);

  const { statusCode, payload } = await call({ required: false });

  assert.equal(statusCode, 200);
  assert.equal(payload.institution.totpRequired, false);
  assert.equal(institution.saves, 1);
  assert.deepEqual(
    recorded.map((entry) => [entry.action, entry.actorId, entry.targetId, entry.details.name]),
    [["institution.totp.disable", "admin-1", "institution-1", "Botho University"]],
  );
});

test("turning the authenticator back on is audited as an enable", async () => {
  const institution = institutionWith({ totpRequired: false });
  stub(institution);

  assert.equal((await call({ required: true })).statusCode, 200);
  assert.equal(institution.totpRequired, true);
  assert.equal(recorded[0]?.action, "institution.totp.enable");
});

test("an institution saved before the setting existed counts as on", async () => {
  const unchanged = institutionWith();
  stub(unchanged);
  assert.equal((await call({ required: true })).statusCode, 200);
  assert.equal(unchanged.saves, 0);
  assert.equal(recorded.length, 0);

  const changed = institutionWith();
  stub(changed);
  await call({ required: false });
  assert.equal(changed.totpRequired, false);
  assert.equal(recorded[0]?.action, "institution.totp.disable");
});

test("setting the value it already has writes nothing", async () => {
  const institution = institutionWith({ totpRequired: false });
  stub(institution);

  assert.equal((await call({ required: false })).statusCode, 200);
  assert.equal(institution.saves, 0);
  assert.equal(recorded.length, 0);
});

test("only a real boolean is accepted", async () => {
  for (const body of [{ required: "false" }, { required: 0 }, {}, undefined]) {
    const institution = institutionWith({ totpRequired: true });
    stub(institution);
    assert.equal((await call(body)).statusCode, 400, JSON.stringify(body));
    assert.equal(institution.saves, 0);
  }
});

test("an unknown institution is a 404", async () => {
  stub(null);
  assert.equal((await call({ required: false })).statusCode, 404);
});

test("roles other than AppAdmin can't change the setting", async () => {
  for (const role of ["InstitutionAdmin", "SAAD", "Student"]) {
    const institution = institutionWith({ totpRequired: true });
    stub(institution);
    assert.equal((await call({ required: false }, { _id: "u1", role: { name: role } })).statusCode, 403, role);
    assert.equal(institution.totpRequired, true);
    assert.equal(recorded.length, 0);
  }
});
