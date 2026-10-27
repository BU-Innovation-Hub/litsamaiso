import test, { before } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import type { Request, Response } from "express";
import { Secret, TOTP } from "otpauth";

import {
  confirmEnrollmentCode,
  createEnrollment,
  matchCode,
  normalizeCode,
  readEnrollmentToken,
} from "./totpService.js";
import { decryptSecret, encryptSecret } from "../utils/secretBox.js";
import { PHOTO_CAPTURE_GRANT_HEADER, requirePhotoCaptureGrant } from "../middleware/totpVerification.js";
import AppError from "../utils/errors.js";

before(() => {
  process.env.JWT_SECRET = "test-secret";
  process.env.TOTP_ENCRYPTION_KEY = randomBytes(32).toString("base64");
});

const PERIOD_MS = 30 * 1000;
// Middle of a time step, so ±1 step can't cross into a neighbouring one by rounding
const NOW = Date.UTC(2026, 0, 1, 12, 0, 15);

const codeAt = (secret: string, timestamp: number) =>
  TOTP.generate({ secret: Secret.fromBase32(secret), algorithm: "SHA1", digits: 6, period: 30, timestamp });

const assertAppError = (fn: () => unknown, code: string) =>
  assert.throws(fn, (error: unknown) => error instanceof AppError && error.code === code);

test("secrets round-trip through encryption and are never stored as plaintext", () => {
  const sealed = encryptSecret("JBSWY3DPEHPK3PXP");
  assert.match(sealed, /^v1:/);
  assert.ok(!sealed.includes("JBSWY3DPEHPK3PXP"));
  assert.equal(decryptSecret(sealed), "JBSWY3DPEHPK3PXP");
  // A fresh IV each time, so equal secrets don't produce equal ciphertexts
  assert.notEqual(encryptSecret("JBSWY3DPEHPK3PXP"), sealed);
});

test("a tampered or foreign-key ciphertext is rejected", () => {
  const sealed = encryptSecret("JBSWY3DPEHPK3PXP");
  const parts = sealed.split(":");
  const ciphertext = Buffer.from(parts[3] as string, "base64url");
  ciphertext[0] = (ciphertext[0] as number) ^ 1;
  parts[3] = ciphertext.toString("base64url");
  assert.throws(() => decryptSecret(parts.join(":")));

  const original = process.env.TOTP_ENCRYPTION_KEY;
  process.env.TOTP_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  try {
    assert.throws(() => decryptSecret(sealed));
  } finally {
    process.env.TOTP_ENCRYPTION_KEY = original;
  }
});

test("codes are accepted for the current step and one step either side, and no further", () => {
  const secret = new Secret({ size: 20 }).base32;
  const step = TOTP.counter({ period: 30, timestamp: NOW });

  assert.equal(matchCode(secret, codeAt(secret, NOW), NOW), step);
  assert.equal(matchCode(secret, codeAt(secret, NOW - PERIOD_MS), NOW), step - 1);
  assert.equal(matchCode(secret, codeAt(secret, NOW + PERIOD_MS), NOW), step + 1);
  assert.equal(matchCode(secret, codeAt(secret, NOW - 2 * PERIOD_MS), NOW), null);
  assert.equal(matchCode(secret, codeAt(secret, NOW + 2 * PERIOD_MS), NOW), null);
  assert.equal(matchCode(secret, "abcdef", NOW), null);
  assert.equal(matchCode(secret, "12345", NOW), null);
});

test("codes match the RFC 6238 test vectors that authenticator apps implement", () => {
  // RFC 6238 Appendix B, SHA-1 key "12345678901234567890"; apps show the last 6 of the 8 digits
  const rfcSecret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  for (const [seconds, code] of [
    [59, "287082"],
    [1111111109, "081804"],
    [1234567890, "005924"],
    [2000000000, "279037"],
  ] as const) {
    assert.equal(matchCode(rfcSecret, code, seconds * 1000), Math.floor(seconds / 30), String(seconds));
  }
});

test("codes are normalized the way authenticator apps display them", () => {
  assert.equal(normalizeCode(" 123 456 "), "123456");
  assert.equal(normalizeCode(123456), "123456");
  assert.equal(normalizeCode(undefined), "");
  assert.equal(normalizeCode({}), "");
});

test("enrollment produces a URI every authenticator app understands", async () => {
  const enrollment = await createEnrollment({ subject: "student@example.com", label: "student@example.com" });
  const uri = new URL(enrollment.otpauthUrl);

  assert.equal(uri.protocol, "otpauth:");
  assert.equal(uri.host, "totp");
  assert.equal(uri.searchParams.get("algorithm"), "SHA1");
  assert.equal(uri.searchParams.get("digits"), "6");
  assert.equal(uri.searchParams.get("period"), "30");
  assert.equal(uri.searchParams.get("secret"), enrollment.secret);
  assert.ok(uri.searchParams.get("issuer"));
  assert.match(enrollment.qrCodeDataUrl, /^data:image\/png;base64,/);
  // The token carries the secret encrypted, not readable by decoding the JWT
  assert.ok(!Buffer.from(enrollment.enrollmentToken.split(".")[1] as string, "base64url").toString().includes(enrollment.secret));
});

test("an enrollment token is only valid for the subject it was issued to", async () => {
  const enrollment = await createEnrollment({ subject: "student@example.com", label: "student@example.com" });

  assert.equal(readEnrollmentToken(enrollment.enrollmentToken, "student@example.com").secret, enrollment.secret);
  assertAppError(() => readEnrollmentToken(enrollment.enrollmentToken, "other@example.com"), "TOTP_ENROLLMENT_EXPIRED");
  assertAppError(() => readEnrollmentToken(`${enrollment.enrollmentToken}x`, "student@example.com"), "TOTP_ENROLLMENT_EXPIRED");
  assertAppError(() => readEnrollmentToken(undefined, "student@example.com"), "TOTP_REQUIRED");
});

test("an enrollment token signed under a different JWT secret is rejected", async () => {
  const enrollment = await createEnrollment({ subject: "student@example.com", label: "student@example.com" });
  process.env.JWT_SECRET = "rotated-secret";
  try {
    assertAppError(() => readEnrollmentToken(enrollment.enrollmentToken, "student@example.com"), "TOTP_ENROLLMENT_EXPIRED");
  } finally {
    process.env.JWT_SECRET = "test-secret";
  }
});

test("confirming enrollment stores the secret encrypted with the step of the code used", () => {
  const secret = new Secret({ size: 20 }).base32;
  const fields = confirmEnrollmentCode(secret, codeAt(secret, Date.now()));

  assert.equal(decryptSecret(fields.totpSecretEncrypted), secret);
  assert.ok(fields.totpEnabledAt instanceof Date);
  assert.equal(typeof fields.totpLastUsedStep, "number");
  assertAppError(() => confirmEnrollmentCode(secret, codeAt(secret, Date.now() + 10 * PERIOD_MS)), "TOTP_INVALID");
  assertAppError(() => confirmEnrollmentCode(secret, "not-a-code"), "TOTP_INVALID");
});

const runGrantMiddleware = async (user: unknown, headers: Record<string, string> = {}) => {
  let statusCode = 200;
  let body: unknown;
  let nextCalled = false;
  const req = { headers, user } as unknown as Request;
  const res = {
    locals: {},
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(payload: unknown) {
      body = payload;
      return this;
    },
  } as unknown as Response;
  await requirePhotoCaptureGrant(req, res, () => {
    nextCalled = true;
  });
  return { statusCode, body, nextCalled };
};

test("only students need a capture grant to save their profile photo", async () => {
  const admin = await runGrantMiddleware({ _id: "u1", role: { name: "SAAD" } });
  assert.equal(admin.nextCalled, true);

  const student = await runGrantMiddleware({ _id: "u2", role: { name: "Student" } });
  assert.equal(student.nextCalled, false);
  assert.equal(student.statusCode, 403);
  assert.equal((student.body as { code?: string }).code, "PHOTO_CAPTURE_GRANT_REQUIRED");

  const emptyGrant = await runGrantMiddleware({ _id: "u2", role: "student" }, { [PHOTO_CAPTURE_GRANT_HEADER]: "" });
  assert.equal(emptyGrant.nextCalled, false);
  assert.equal(emptyGrant.statusCode, 403);
});
