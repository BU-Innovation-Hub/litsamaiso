import type { Request, Response } from "express";
import { uploadFileBuffer } from "../utils/cloudinary.js";

export const uploadFile = async (req: Request, res: Response) => {
  try {
    const file = (req as any).file;
    if (!file || !file.buffer) {
      res.status(400).json({ error: "Missing file" });
      return;
    }

    const result = await uploadFileBuffer({
      buffer: file.buffer,
      fileName: file.originalname,
      folder: "uploads",
      resourceType: "auto",
    });
    res.json({ url: result.url, publicId: result.publicId });
  } catch (err: any) {
    console.error("Upload error:", err);
    res.status(500).json({ error: err.message || "Upload failed" });
  }
};

export const uploadImage = uploadFile;
