import test from "node:test";
import assert from "node:assert/strict";

import { auditActor } from "./auditLog.js";

test("auditActor records who acted, with the role name when it's known", () => {
  assert.deepEqual(auditActor({ _id: "user-1", email: "a@example.com", role: { _id: "role-1", name: "Finance" } }), {
    actorId: "user-1",
    actorEmail: "a@example.com",
    actorRole: "Finance",
  });
  assert.deepEqual(auditActor({ _id: "user-1", role: "SAAD" }), { actorId: "user-1", actorRole: "SAAD" });
  // An unpopulated role is only an id, which isn't worth recording as the role
  assert.deepEqual(auditActor({ _id: "user-1", role: { toString: () => "role-1" } }), { actorId: "user-1" });
  assert.deepEqual(auditActor(null), {});
});
