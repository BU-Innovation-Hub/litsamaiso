import type { Request, Response } from "express";
import { uploadImageBuffer } from "../utils/cloudinary.js";

export const uploadImage = async (req: Request, res: Response) => {
  try {
    const file = (req as any).file;
    if (!file || !file.buffer) {
      res.status(400).json({ error: "Missing file" });
      return;
    }

    const result = await uploadImageBuffer({ buffer: file.buffer, fileName: file.originalname, folder: "uploads" });
    res.json({ url: result.url, publicId: result.publicId });
  } catch (err: any) {
    console.error("Upload error:", err);
    res.status(500).json({ error: err.message || "Upload failed" });
  }
};
