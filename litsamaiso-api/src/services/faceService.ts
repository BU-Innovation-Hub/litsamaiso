import { createRequire } from "node:module";
import path from "node:path";
import jpeg from "jpeg-js";
import AppError from "../utils/errors.js";

type FaceApi = typeof import("@vladmandic/face-api");
type Tfjs = typeof import("@tensorflow/tfjs");
type WasmBackend = typeof import("@tensorflow/tfjs-backend-wasm");

const require = createRequire(import.meta.url);

// The client sends 640px camera frames. Bigger images would permanently grow the WASM heap.
const MAX_PHOTO_SIDE = 1280;
// Face embeddings closer than this (Euclidean distance) are treated as the same person.
// The closest two different people in face-api's sample photos came out 0.49 apart, so 0.5 was
// too loose; 0.4 was stricter than needed for real students, so this sits between the two.
const DEFAULT_MATCH_THRESHOLD = 0.45;
// face-api's own cut-off for "same person". Different people are usually 0.6 to 0.9 apart, so a
// FACE_MATCH_THRESHOLD above this is a mistake (say "4" for "0.4") that would let almost anyone through.
const MAX_MATCH_THRESHOLD = 0.6;
// The detector's confidence that it found a face. Dim, blurred or turned-away faces score lower,
// and their embeddings drift too far to compare: clear camera frames score 0.75 and up.
const MIN_FACE_SCORE = 0.55;
// The face's height or width, whichever is smaller, as a share of the photo's shorter side.
// Smaller faces are too far from the camera to compare reliably.
const MIN_FACE_SHARE = 0.25;
const NO_FACE_MESSAGE = "No face was found. Face the camera in good light and try again.";
const MULTIPLE_FACES_MESSAGE = "More than one face is in the photo. Make sure only you are in the frame.";

export type DetectedFace = { descriptor: number[]; score: number; share: number };

let faceApiReady: Promise<FaceApi> | null = null;

// TensorFlow runs on its WASM backend: there's no native binary, so it behaves the same on
// Windows, any Node version and Render. The tiny detector keeps memory flat at about 350MB;
// the SSD detector kept growing past 512MB.
const loadFaceApi = (): Promise<FaceApi> => {
  faceApiReady ??= (async () => {
    // face-api's node-wasm build requires these same two packages, so they share one TensorFlow instance
    const tf = require("@tensorflow/tfjs") as Tfjs;
    const wasm = require("@tensorflow/tfjs-backend-wasm") as WasmBackend;
    const faceapi = require("@vladmandic/face-api/dist/face-api.node-wasm.js") as FaceApi;

    const wasmDir = path.dirname(require.resolve("@tensorflow/tfjs-backend-wasm/dist/tfjs-backend-wasm.wasm"));
    wasm.setWasmPaths(wasmDir + path.sep);
    await tf.setBackend("wasm");
    await tf.ready();

    const modelDir = path.join(path.dirname(require.resolve("@vladmandic/face-api/package.json")), "model");
    await faceapi.nets.tinyFaceDetector.loadFromDisk(modelDir);
    await faceapi.nets.faceLandmark68Net.loadFromDisk(modelDir);
    await faceapi.nets.faceRecognitionNet.loadFromDisk(modelDir);
    return faceapi;
  })().catch((error: unknown) => {
    // Let the next request retry rather than caching the failure
    faceApiReady = null;
    throw error;
  });
  return faceApiReady;
};

// Loading takes a moment, so do it at startup instead of during a student's first check
export const warmUpFaceModels = async (): Promise<void> => {
  // Also warns now, rather than at the first vote, if FACE_MATCH_THRESHOLD is set wrong
  getFaceMatchThreshold();
  await loadFaceApi();
};

const decodePhoto = (faceapi: FaceApi, photo: Buffer) => {
  let image: { width: number; height: number; data: Uint8Array };
  try {
    image = jpeg.decode(photo, {
      useTArray: true,
      formatAsRGBA: false,
      maxResolutionInMP: 2,
      maxMemoryUsageInMB: 64,
    });
  } catch {
    throw new AppError("The photo could not be read. Take it again with the camera.", 400, "FACE_PHOTO_UNREADABLE");
  }

  if (image.width > MAX_PHOTO_SIDE || image.height > MAX_PHOTO_SIDE) {
    throw new AppError(`The photo must be at most ${MAX_PHOTO_SIDE}px on each side.`, 400, "FACE_PHOTO_TOO_LARGE");
  }

  return faceapi.tf.tensor3d(image.data, [image.height, image.width, 3], "int32");
};

// Every face in the photo, largest (closest to the camera) first. The detector's own threshold
// stays low so faint faces are still found: they count as extra people, and a faint main face
// is reported as unclear rather than missing.
const detectFaces = async (photo: Buffer): Promise<DetectedFace[]> => {
  const faceapi = await loadFaceApi();
  const tensor = decodePhoto(faceapi, photo);
  try {
    const [height, width] = tensor.shape;
    const shortSide = Math.min(height, width);
    const faces = await faceapi
      .detectAllFaces(tensor, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.3 }))
      .withFaceLandmarks()
      .withFaceDescriptors();
    return faces
      .sort((a, b) => b.detection.box.area - a.detection.box.area)
      .map((face) => ({
        descriptor: Array.from(face.descriptor),
        score: face.detection.score,
        share: Math.min(face.detection.box.width, face.detection.box.height) / shortSide,
      }));
  } finally {
    tensor.dispose();
  }
};

// Only a close, clear face gives an embedding that can be trusted either way
const assertComparable = (face: DetectedFace): void => {
  if (face.share < MIN_FACE_SHARE) {
    throw new AppError(
      "Your face is too far from the camera. Move closer so it fills the oval, then try again.",
      422,
      "FACE_TOO_SMALL",
    );
  }
  if (face.score < MIN_FACE_SCORE) {
    throw new AppError(
      "Your face isn't clear enough. Look straight at the camera in good light, then try again.",
      422,
      "FACE_UNCLEAR",
    );
  }
};

// The profile photo is the reference, so it must show only the student
export const pickProfileFace = (faces: readonly DetectedFace[]): number[] => {
  const [face] = faces;
  if (!face) throw new AppError(NO_FACE_MESSAGE, 422, "FACE_NOT_FOUND");
  if (faces.length > 1) throw new AppError(MULTIPLE_FACES_MESSAGE, 422, "MULTIPLE_FACES");
  assertComparable(face);
  return face.descriptor;
};

// At the ballot the largest face is the person at the camera. Small faces behind them are
// ignored, but a second face just as close means it isn't clear who is being checked.
export const pickVoterFace = (faces: readonly DetectedFace[]): number[] => {
  const [closest, ...others] = faces;
  if (!closest) throw new AppError(NO_FACE_MESSAGE, 422, "FACE_NOT_FOUND");
  if (others.some((face) => face.share >= MIN_FACE_SHARE)) {
    throw new AppError(MULTIPLE_FACES_MESSAGE, 422, "MULTIPLE_FACES");
  }
  assertComparable(closest);
  return closest.descriptor;
};

export const getProfileFaceDescriptor = async (photo: Buffer): Promise<number[]> =>
  pickProfileFace(await detectFaces(photo));

export const getVoterFaceDescriptor = async (photo: Buffer): Promise<number[]> =>
  pickVoterFace(await detectFaces(photo));

export const faceDistance = (a: readonly number[], b: readonly number[]): number => {
  if (a.length === 0 || a.length !== b.length) {
    throw new Error("Face descriptors must have the same, non-zero length");
  }
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) {
    const diff = (a[i] as number) - (b[i] as number);
    sum += diff * diff;
  }
  return Math.sqrt(sum);
};

let ignoredThresholdSetting: string | undefined;

export const getFaceMatchThreshold = (): number => {
  const setting = process.env.FACE_MATCH_THRESHOLD?.trim();
  if (!setting) return DEFAULT_MATCH_THRESHOLD;

  const configured = Number(setting);
  if (Number.isFinite(configured) && configured > 0 && configured <= MAX_MATCH_THRESHOLD) return configured;

  // This runs on every face check, so each bad setting is reported once
  if (ignoredThresholdSetting !== setting) {
    ignoredThresholdSetting = setting;
    console.warn(
      `FACE_MATCH_THRESHOLD=${setting} is ignored: it must be a number above 0 and at most ${MAX_MATCH_THRESHOLD}. ` +
        `Using ${DEFAULT_MATCH_THRESHOLD}.`,
    );
  }
  return DEFAULT_MATCH_THRESHOLD;
};
