import type { Request, Response } from "express";

export const validateAccount = async (req: Request, res: Response) => {
  res.status(410).json({
    message: "Gemini account validation has been retired. Use server OCR candidate extraction instead.",
  });
};
