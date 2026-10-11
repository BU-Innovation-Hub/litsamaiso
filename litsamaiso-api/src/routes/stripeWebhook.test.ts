import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";

process.env.STRIPE_SECRET_KEY ||= "sk_test_dummy";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";

const { stripeWebhook } = await import("../controllers/webhookController.js");

let server: Server;
let url: string;

before(async () => {
  const app = express();
  app.post("/webhook", express.raw({ type: "application/json" }), stripeWebhook);
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/webhook`;
});

after(() => {
  server.close();
});

const payload = JSON.stringify({ id: "evt_test", object: "event", type: "customer.created", data: { object: {} } });

test("webhooks without a signature are rejected", async () => {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: payload });
  assert.equal(res.status, 400);
});

test("webhooks with a forged signature are rejected before any processing", async () => {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Stripe-Signature": "t=1,v1=deadbeef" },
    body: payload,
  });
  assert.equal(res.status, 400);
  assert.match(((await res.json()) as { message: string }).message, /Invalid signature/);
});
