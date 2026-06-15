import type { Request, Response } from "express";
import Tesseract from "tesseract.js";
import { extractAccountCandidates } from "../services/geminiService.js";

export const serverOcr = async (req: Request, res: Response) => {
  try {
    const file = (req as any).file;
    if (!file || !file.buffer) {
      res.status(400).json({ error: "Missing file" });
      return;
    }

    // Tesseract expects a blob/url; pass the buffer via data URL
    const base64 = file.buffer.toString("base64");
    const dataUrl = `data:${file.mimetype};base64,${base64}`;

    const result = await Tesseract.recognize(dataUrl, "eng", {
      tessedit_pageseg_mode: "6",
      preserve_interword_spaces: "1",
      user_defined_dpi: "300",
    } as any);

    const ocrText = result.data?.text || "";
    const candidates = extractAccountCandidates(ocrText);

    res.json({ ocrText, candidates });
  } catch (err: any) {
    console.error("Server OCR error:", err);
    res.status(500).json({ error: err?.message || "OCR failed" });
  }
};
