import test, { before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { Request, Response } from "express";
import jpeg from "jpeg-js";
import jwt from "jsonwebtoken";

import {
  type DetectedFace,
  faceDistance,
  getFaceMatchThreshold,
  getProfileFaceDescriptor,
  getVoterFaceDescriptor,
  pickProfileFace,
  pickVoterFace,
} from "./faceService.js";
import { isValidFaceToken, issueFaceToken, verifyVoterFace } from "./faceVerificationService.js";
import { FACE_TOKEN_HEADER, requireFaceVerification } from "../middleware/faceVerification.js";
import { AuditLog } from "../models/AuditLog.js";
import { User } from "../models/User.js";

const require = createRequire(import.meta.url);

before(() => {
  process.env.JWT_SECRET = "test-secret";
});

// A JPEG of the given size filled with one grey, so it has no face in it
const blankJpeg = (width: number, height: number): Buffer =>
  jpeg.encode({ width, height, data: Buffer.alloc(width * height * 4, 128) }, 80).data;

// A JPEG of the region of face-api's own 1920x1280 group photo centred on (centreX, centreY),
// resized to width x height. Faces in it: left (336,396 306x253), middle (776,445 313x256),
// right (1422,215 307x283).
const samplePhoto = (
  centreX: number,
  centreY: number,
  regionWidth: number,
  regionHeight: number,
  width: number,
  height: number,
): Buffer => {
  const file = path.join(path.dirname(require.resolve("@vladmandic/face-api/package.json")), "demo", "sample1.jpg");
  const source = jpeg.decode(readFileSync(file), { useTArray: true });
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.floor(centreX - regionWidth / 2 + (x * regionWidth) / width);
      const sourceY = Math.floor(centreY - regionHeight / 2 + (y * regionHeight) / height);
      const from = (sourceY * source.width + sourceX) * 4;
      data.set(source.data.subarray(from, from + 4), (y * width + x) * 4);
    }
  }
  return jpeg.encode({ width, height, data }, 90).data;
};

// The whole group photo, halved so it's within the 1280px limit. Every face is small in it.
const groupPhoto = () => samplePhoto(960, 640, 1920, 1280, 960, 640);
// 640x480 camera frames, like the client sends, with one person close to the camera
const leftPersonPhoto = () => samplePhoto(489, 522, 640, 480, 640, 480);
const leftPersonFurtherBackPhoto = () => samplePhoto(489, 522, 800, 600, 640, 480);
const middlePersonPhoto = () => samplePhoto(932, 573, 640, 480, 640, 480);
// The left and middle people both close to the camera
const twoPeoplePhoto = () => samplePhoto(712, 573, 900, 675, 640, 480);

const detected = (overrides: Partial<DetectedFace> = {}): DetectedFace => ({
  descriptor: [0.1, 0.2],
  score: 0.9,
  share: 0.4,
  ...overrides,
});

const runMiddleware = (headers: Record<string, string>, userId: string, electionId: string) => {
  let statusCode = 200;
  let body: unknown;
  let nextCalled = false;
  const req = { headers, user: { _id: userId }, params: { electionId } } as unknown as Request & {
    faceVerifiedAt?: Date;
  };
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
  return { statusCode, body, nextCalled, faceVerifiedAt: req.faceVerifiedAt };
};

test("faceDistance is the Euclidean distance between descriptors", () => {
  assert.equal(faceDistance([0, 0], [3, 4]), 5);
  assert.equal(faceDistance([1, 2, 3], [1, 2, 3]), 0);
  assert.throws(() => faceDistance([1, 2], [1]));
  assert.throws(() => faceDistance([], []));
});

test("the match threshold defaults to 0.45 and can be tuned from the environment up to 0.6", () => {
  const realWarn = console.warn;
  const warnings: string[] = [];
  console.warn = (message: string) => {
    warnings.push(message);
  };
  const thresholdFor = (setting: string | undefined) => {
    if (setting === undefined) delete process.env.FACE_MATCH_THRESHOLD;
    else process.env.FACE_MATCH_THRESHOLD = setting;
    return getFaceMatchThreshold();
  };

  try {
    assert.equal(thresholdFor(undefined), 0.45);
    assert.equal(thresholdFor(""), 0.45);
    assert.equal(thresholdFor("0.35"), 0.35);
    assert.equal(thresholdFor("0.6"), 0.6);
    assert.deepEqual(warnings, []);

    // Settings that would loosen or break the check fall back to 0.45, with one warning each
    assert.equal(thresholdFor("4"), 0.45);
    assert.equal(thresholdFor("4"), 0.45);
    assert.equal(thresholdFor("0.61"), 0.45);
    assert.equal(thresholdFor("0"), 0.45);
    assert.equal(thresholdFor("not-a-number"), 0.45);
    assert.equal(warnings.length, 4);
    assert.match(warnings[0] ?? "", /FACE_MATCH_THRESHOLD=4 is ignored/);
  } finally {
    console.warn = realWarn;
    delete process.env.FACE_MATCH_THRESHOLD;
  }
});

test("only a close, clear face is compared", () => {
  for (const pick of [pickProfileFace, pickVoterFace]) {
    assert.deepEqual(pick([detected()]), [0.1, 0.2]);
    assert.throws(() => pick([]), { code: "FACE_NOT_FOUND", statusCode: 422 });
    assert.throws(() => pick([detected({ share: 0.2 })]), { code: "FACE_TOO_SMALL", statusCode: 422 });
    assert.throws(() => pick([detected({ score: 0.5 })]), { code: "FACE_UNCLEAR", statusCode: 422 });
  }
});

test("the profile photo must show only the student, the ballot photo only one person close by", () => {
  const backgroundFace = detected({ descriptor: [0.9, 0.9], share: 0.1, score: 0.4 });
  const secondCloseFace = detected({ descriptor: [0.9, 0.9], share: 0.3 });

  assert.throws(() => pickProfileFace([detected(), backgroundFace]), { code: "MULTIPLE_FACES" });
  assert.deepEqual(pickVoterFace([detected(), backgroundFace]), [0.1, 0.2]);
  assert.throws(() => pickVoterFace([detected(), secondCloseFace]), { code: "MULTIPLE_FACES" });
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
  // When the ballot opened, to the second, so a late ballot can be checked against the close time
  assert.ok(valid.faceVerifiedAt instanceof Date);
  assert.ok(Math.abs(valid.faceVerifiedAt.getTime() - Date.now()) < 2_000);
});

test("the face model reads real photos and rejects unusable ones", async () => {
  const photo = leftPersonPhoto();
  const descriptor = await getVoterFaceDescriptor(photo);
  assert.equal(descriptor.length, 128);
  assert.equal(faceDistance(descriptor, await getProfileFaceDescriptor(photo)), 0);

  // A profile photo must show only the student; at the ballot these faces are all too far away
  await assert.rejects(getProfileFaceDescriptor(groupPhoto()), { code: "MULTIPLE_FACES", statusCode: 422 });
  await assert.rejects(getVoterFaceDescriptor(groupPhoto()), { code: "FACE_TOO_SMALL", statusCode: 422 });
  await assert.rejects(getVoterFaceDescriptor(twoPeoplePhoto()), { code: "MULTIPLE_FACES", statusCode: 422 });
  await assert.rejects(getVoterFaceDescriptor(blankJpeg(320, 240)), { code: "FACE_NOT_FOUND", statusCode: 422 });
  await assert.rejects(getVoterFaceDescriptor(Buffer.from("not a jpeg")), { code: "FACE_PHOTO_UNREADABLE" });
  await assert.rejects(getVoterFaceDescriptor(blankJpeg(1400, 16)), { code: "FACE_PHOTO_TOO_LARGE" });
});

test("the match threshold accepts the same person and rejects someone else", async () => {
  delete process.env.FACE_MATCH_THRESHOLD;
  const profile = await getProfileFaceDescriptor(leftPersonPhoto());
  const samePerson = await getVoterFaceDescriptor(leftPersonFurtherBackPhoto());
  const someoneElse = await getVoterFaceDescriptor(middlePersonPhoto());

  assert.ok(faceDistance(profile, samePerson) <= getFaceMatchThreshold());
  assert.ok(faceDistance(profile, someoneElse) > getFaceMatchThreshold());
});

test("every face check is audited, with the distance but never the face", async () => {
  const realCreate = AuditLog.create;
  const realFindById = User.findById;
  const recorded: Array<Record<string, any>> = [];
  let enrolled: number[] = [];
  AuditLog.create = (async (payload: Record<string, any>) => {
    recorded.push(payload);
  }) as any;
  User.findById = (() => ({ select: async () => ({ faceDescriptor: enrolled }) })) as any;
  const voter = { _id: "user-1", email: "student@example.com", role: { name: "Student" } };
  const check = (photo: Buffer) => verifyVoterFace({ user: voter, electionId: "election-1", photo });

  try {
    delete process.env.FACE_MATCH_THRESHOLD;
    await assert.rejects(check(leftPersonPhoto()), { code: "FACE_NOT_ENROLLED" });
    enrolled = await getProfileFaceDescriptor(leftPersonPhoto());
    await check(leftPersonFurtherBackPhoto());
    await assert.rejects(check(middlePersonPhoto()), { code: "FACE_MISMATCH" });
  } finally {
    AuditLog.create = realCreate;
    User.findById = realFindById;
  }

  assert.deepEqual(
    recorded.map((entry) => [entry.action, entry.details.reason]),
    [
      ["vote.faceVerify.failed", "FACE_NOT_ENROLLED"],
      ["vote.faceVerify", undefined],
      ["vote.faceVerify.failed", "FACE_MISMATCH"],
    ],
  );
  for (const entry of recorded) {
    assert.equal(entry.actorId, "user-1");
    assert.equal(entry.targetId, "election-1");
    assert.ok(Object.values(entry.details).every((value) => !Array.isArray(value)));
  }
  assert.ok(recorded[1]?.details.distance <= recorded[1]?.details.threshold);
  assert.ok(recorded[2]?.details.distance > recorded[2]?.details.threshold);
});
