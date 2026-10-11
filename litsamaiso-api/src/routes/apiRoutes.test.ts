import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";

import { API_V1_PREFIX, apiNotFoundHandler, apiV1Routes, registerApiRoutes } from "./apiRoutes.js";

let server: Server;
let baseUrl: string;

before(async () => {
  const app = express();
  app.use(express.json());
  registerApiRoutes(app);
  app.use(apiNotFoundHandler);

  server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => {
  server.close();
});

const get = (path: string) => fetch(`${baseUrl}${path}`);

test("every v1 route is served under the version prefix and at its legacy path", async () => {
  // Requests without a token are rejected by requireAuth before any database access,
  // so an auth error (rather than a 404) proves the router is mounted.
  for (const path of ["/accounts", "/elections", "/audit-logs", "/registry/imports"]) {
    const versioned = await get(`${API_V1_PREFIX}${path}`);
    const legacy = await get(path);
    assert.equal(versioned.status, 401, `${API_V1_PREFIX}${path}`);
    assert.equal(legacy.status, 401, path);
  }
});

test("the route table has no duplicate mount paths", () => {
  const paths = apiV1Routes.map(([path]) => path);
  assert.equal(new Set(paths).size, paths.length);
});

test("legacy paths advertise deprecation and point at the v1 successor", async () => {
  const legacy = await get("/accounts?page=2");
  assert.match(legacy.headers.get("deprecation") ?? "", /^@\d+$/);
  assert.equal(legacy.headers.get("link"), `<${API_V1_PREFIX}/accounts?page=2>; rel="successor-version"`);
  assert.equal(legacy.headers.get("sunset"), null);

  const versioned = await get(`${API_V1_PREFIX}/accounts`);
  assert.equal(versioned.headers.get("deprecation"), null);
  assert.equal(versioned.headers.get("link"), null);
});

test("the version prefix is case-sensitive", async () => {
  const res = await get("/API/V1/accounts");
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { message: "Not found" });
});

test("unknown API paths and versions return a JSON 404", async () => {
  for (const path of [`${API_V1_PREFIX}/nope`, "/api/v2/accounts", `${API_V1_PREFIX}/health`, "/nope"]) {
    const res = await get(path);
    assert.equal(res.status, 404, path);
    assert.match(res.headers.get("content-type") ?? "", /application\/json/, path);
    assert.deepEqual(await res.json(), { message: "Not found" }, path);
  }
});

test("the version root identifies the version", async () => {
  const res = await get(API_V1_PREFIX);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { version: "v1" });
});

test("billing and onboarding routes are mounted and guarded", async () => {
  for (const path of ["/billing/status"]) {
    assert.equal((await get(`${API_V1_PREFIX}${path}`)).status, 401, path);
  }
  const post = (path: string, body: unknown) =>
    fetch(`${baseUrl}${API_V1_PREFIX}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  assert.equal((await post("/billing/portal", {})).status, 401);
  // Input is validated before any database access.
  assert.equal((await post("/billing/renew", {})).status, 400);
  const draft = await post("/onboarding/drafts", { plan: "platinum" });
  assert.equal(draft.status, 400);
  assert.equal(((await draft.json()) as { field?: string }).field, "plan");
  assert.equal((await post("/onboarding/complete", { sessionId: "nope" })).status, 400);
});
