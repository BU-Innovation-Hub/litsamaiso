import type { Request, Response, NextFunction } from "express";
import multer from "multer";
import { isValidFaceToken } from "../services/faceVerificationService.js";

export const FACE_TOKEN_HEADER = "x-face-token";

const facePhotoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    // The client captures camera frames as JPEG, and the server only decodes JPEG
    if (file.mimetype !== "image/jpeg") {
      cb(new Error("The photo must be a JPEG taken with the camera"));
      return;
    }
    cb(null, true);
  },
});

// Reads the camera photo from the "photo" field into memory. It's only stored if the route saves it.
export const readFacePhoto = (req: Request, res: Response, next: NextFunction) => {
  facePhotoUpload.single("photo")(req, res, (err: unknown) => {
    if (err) {
      res.status(400).json({ message: err instanceof Error ? err.message : "Invalid photo upload" });
      return;
    }
    if (!req.file?.buffer) {
      res.status(400).json({ message: "A photo is required" });
      return;
    }
    next();
  });
};

// The ballot opens only after a face check; this makes casting the vote require it too
export const requireFaceVerification = (req: Request, res: Response, next: NextFunction) => {
  const token = req.headers[FACE_TOKEN_HEADER];
  const userId = String((req as any).user?._id ?? "");
  const electionId = String(req.params.electionId ?? "");

  if (typeof token !== "string" || !isValidFaceToken(token, userId, electionId)) {
    res.status(403).json({
      message: "Verify your face before submitting your ballot",
      code: "FACE_VERIFICATION_REQUIRED",
    });
    return;
  }
  next();
};
