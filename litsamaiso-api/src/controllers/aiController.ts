import type { Request, Response } from "express";
import { validateWithGemini } from "../services/geminiService.js";

export const validateAccount = async (req: Request, res: Response) => {
  try {
    const { imageBase64, ocrExtractedText, candidates, bankName } = req.body;

    if (!imageBase64 || !ocrExtractedText || !Array.isArray(candidates)) {
      res.status(400).json({ error: "Missing required fields: imageBase64, ocrExtractedText, candidates" });
      return;
    }

    const result = await validateWithGemini(imageBase64, ocrExtractedText, candidates, bankName || null);
    res.json(result);
  } catch (err: any) {
    console.error("AI validation error:", err);
    res.status(500).json({ error: err?.message || "AI validation failed" });
  }
};
