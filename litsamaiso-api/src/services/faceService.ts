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
// Face embeddings closer than this (Euclidean distance) are treated as the same person
const DEFAULT_MATCH_THRESHOLD = 0.5;
const NO_FACE_MESSAGE = "No face was found. Face the camera in good light and try again.";

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

// Embeddings of every face in the photo, largest (closest to the camera) first
const detectFaces = async (photo: Buffer): Promise<number[][]> => {
  const faceapi = await loadFaceApi();
  const tensor = decodePhoto(faceapi, photo);
  try {
    const faces = await faceapi
      .detectAllFaces(tensor, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.3 }))
      .withFaceLandmarks()
      .withFaceDescriptors();
    return faces
      .sort((a, b) => b.detection.box.area - a.detection.box.area)
      .map((face) => Array.from(face.descriptor));
  } finally {
    tensor.dispose();
  }
};

// The profile photo is the reference, so it must show only the student
export const getProfileFaceDescriptor = async (photo: Buffer): Promise<number[]> => {
  const faces = await detectFaces(photo);
  const [face] = faces;
  if (!face) throw new AppError(NO_FACE_MESSAGE, 422, "FACE_NOT_FOUND");
  if (faces.length > 1) {
    throw new AppError("More than one face is in the photo. Make sure only you are in the frame.", 422, "MULTIPLE_FACES");
  }
  return face;
};

// At the ballot the largest face is the person at the camera; others may be passing behind them
export const getVoterFaceDescriptor = async (photo: Buffer): Promise<number[]> => {
  const [closest] = await detectFaces(photo);
  if (!closest) throw new AppError(NO_FACE_MESSAGE, 422, "FACE_NOT_FOUND");
  return closest;
};

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

export const getFaceMatchThreshold = (): number => {
  const configured = Number(process.env.FACE_MATCH_THRESHOLD);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_MATCH_THRESHOLD;
};
