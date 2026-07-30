import type { Request, Response } from "express";
import Tesseract from "tesseract.js";
import { extractAccountCandidates } from "../services/geminiService.js";

const BANK_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: "Standard Lesotho Bank", pattern: /\bstandard\s+lesotho\s+bank\b|\bstandard\s+bank\b|\bsbl\b|www\.standardbank\./i },
  { name: "First National Bank", pattern: /\bfirst\s+national\s+bank\b|\bfnb\b|@fnb\.|www\.fnb\./i },
  { name: "Lesotho Post Bank", pattern: /\blesotho\s+post\s+bank\b|\bpost\s*bank\b|\bpostbank\b/i },
  { name: "Nedbank Lesotho", pattern: /\bnedbank\s+lesotho\b|\bnedbank\b|www\.nedbank\./i },
  { name: "ABSA", pattern: /\babsa\b|www\.absa\./i },
];

function extractBankName(ocrText: string): string | null {
  const normalized = ocrText.replace(/[^\x20-\x7E\n]/g, " ");
  const match = BANK_PATTERNS.find(({ pattern }) => pattern.test(normalized));
  return match?.name || null;
}

export const serverOcr = async (req: Request, res: Response) => {
  try {
    const file = (req as any).file;
    if (!file || !file.buffer) {
      res.status(400).json({ error: "Missing file" });
      return;
    }

    const mimeType = file.mimetype || "image/jpeg";
    const dataUrl = `data:${mimeType};base64,${file.buffer.toString("base64")}`;

    const result = await Tesseract.recognize(dataUrl, "eng", {
      tessedit_pageseg_mode: "6",
      preserve_interword_spaces: "1",
      user_defined_dpi: "300",
    } as any);

    const ocrText = result.data?.text || "";
    const candidates = extractAccountCandidates(ocrText);
    const detectedBank = extractBankName(ocrText);

    res.json({ ocrText, candidates, detectedBank });
  } catch (err: any) {
    console.error("Server OCR error:", err);
    res.status(500).json({ error: err?.message || "OCR failed" });
  }
};
