import test, { before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { Request, Response } from "express";
import jpeg from "jpeg-js";
import jwt from "jsonwebtoken";

import {
  faceDistance,
  getFaceMatchThreshold,
  getProfileFaceDescriptor,
  getVoterFaceDescriptor,
} from "./faceService.js";
import { isValidFaceToken, issueFaceToken } from "./faceVerificationService.js";
import { FACE_TOKEN_HEADER, requireFaceVerification } from "../middleware/faceVerification.js";

const require = createRequire(import.meta.url);

before(() => {
  process.env.JWT_SECRET = "test-secret";
});

// A JPEG of the given size filled with one grey, so it has no face in it
const blankJpeg = (width: number, height: number): Buffer =>
  jpeg.encode({ width, height, data: Buffer.alloc(width * height * 4, 128) }, 80).data;

// face-api's own sample: a group photo, halved so it's within the 1280px limit
const groupPhoto = (): Buffer => {
  const file = path.join(path.dirname(require.resolve("@vladmandic/face-api/package.json")), "demo", "sample1.jpg");
  const source = jpeg.decode(readFileSync(file), { useTArray: true });
  const width = Math.floor(source.width / 2);
  const height = Math.floor(source.height / 2);
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const from = (y * 2 * source.width + x * 2) * 4;
      data.set(source.data.subarray(from, from + 4), (y * width + x) * 4);
    }
  }
  return jpeg.encode({ width, height, data }, 90).data;
};

const runMiddleware = (headers: Record<string, string>, userId: string, electionId: string) => {
  let statusCode = 200;
  let body: unknown;
  let nextCalled = false;
  const req = { headers, user: { _id: userId }, params: { electionId } } as unknown as Request;
  const res = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(payload: unknown) {
      body = payload;
      return this;
    },
  } as unknown as Response;
  requireFaceVerification(req, res, () => {
    nextCalled = true;
  });
  return { statusCode, body, nextCalled };
};

test("faceDistance is the Euclidean distance between descriptors", () => {
  assert.equal(faceDistance([0, 0], [3, 4]), 5);
  assert.equal(faceDistance([1, 2, 3], [1, 2, 3]), 0);
  assert.throws(() => faceDistance([1, 2], [1]));
  assert.throws(() => faceDistance([], []));
});

test("the match threshold defaults to 0.5 and can be tuned from the environment", () => {
  delete process.env.FACE_MATCH_THRESHOLD;
  assert.equal(getFaceMatchThreshold(), 0.5);
  process.env.FACE_MATCH_THRESHOLD = "0.45";
  assert.equal(getFaceMatchThreshold(), 0.45);
  process.env.FACE_MATCH_THRESHOLD = "not-a-number";
  assert.equal(getFaceMatchThreshold(), 0.5);
  delete process.env.FACE_MATCH_THRESHOLD;
});

test("a face token is valid only for its own student and election", () => {
  const { faceToken, expiresAt } = issueFaceToken("user-1", "election-1");
  assert.ok(new Date(expiresAt).getTime() > Date.now());
  assert.equal(isValidFaceToken(faceToken, "user-1", "election-1"), true);
  assert.equal(isValidFaceToken(faceToken, "user-2", "election-1"), false);
  assert.equal(isValidFaceToken(faceToken, "user-1", "election-2"), false);
  assert.equal(isValidFaceToken("garbage", "user-1", "election-1"), false);
});

test("face tokens and login tokens can't stand in for each other", () => {
  const { faceToken } = issueFaceToken("user-1", "election-1");
  // requireAuth verifies with JWT_SECRET itself, which must reject a face token
  assert.throws(() => jwt.verify(faceToken, "test-secret"));
  const loginToken = jwt.sign({ electionId: "election-1" }, "test-secret", { subject: "user-1" });
  assert.equal(isValidFaceToken(loginToken, "user-1", "election-1"), false);
});

test("an expired face token is rejected", () => {
  const { faceToken } = issueFaceToken("user-1", "election-1");
  const realNow = Date.now;
  Date.now = () => realNow() + 16 * 60 * 1000;
  try {
    assert.equal(isValidFaceToken(faceToken, "user-1", "election-1"), false);
  } finally {
    Date.now = realNow;
  }
});

test("casting a vote requires a face token for that student and election", () => {
  const missing = runMiddleware({}, "user-1", "election-1");
  assert.equal(missing.nextCalled, false);
  assert.equal(missing.statusCode, 403);
  assert.deepEqual((missing.body as { code: string }).code, "FACE_VERIFICATION_REQUIRED");

  const { faceToken } = issueFaceToken("user-1", "election-1");
  const otherStudent = runMiddleware({ [FACE_TOKEN_HEADER]: faceToken }, "user-2", "election-1");
  assert.equal(otherStudent.nextCalled, false);

  const valid = runMiddleware({ [FACE_TOKEN_HEADER]: faceToken }, "user-1", "election-1");
  assert.equal(valid.nextCalled, true);
});

test("the face model reads real photos and rejects unusable ones", async () => {
  const photo = groupPhoto();

  // At the ballot the closest face is used, even with others in the frame
  const descriptor = await getVoterFaceDescriptor(photo);
  assert.equal(descriptor.length, 128);
  assert.equal(faceDistance(descriptor, await getVoterFaceDescriptor(photo)), 0);

  // A profile photo must show only the student
  await assert.rejects(getProfileFaceDescriptor(photo), { code: "MULTIPLE_FACES", statusCode: 422 });
  await assert.rejects(getVoterFaceDescriptor(blankJpeg(320, 240)), { code: "FACE_NOT_FOUND", statusCode: 422 });
  await assert.rejects(getVoterFaceDescriptor(Buffer.from("not a jpeg")), { code: "FACE_PHOTO_UNREADABLE" });
  await assert.rejects(getVoterFaceDescriptor(blankJpeg(1400, 16)), { code: "FACE_PHOTO_TOO_LARGE" });
});
