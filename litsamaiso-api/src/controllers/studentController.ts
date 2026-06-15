import type { Request, Response } from "express";
import { loadStudentsFromExcel } from "../services/studentService.js";
import { Institution } from "../models/Institution.js";

export const uploadStudents = async (req: Request, res: Response) => {
  try {
    const file = (req as any).file;
    if (!file || !file.buffer) {
      res.status(400).json({ message: "Missing file upload" });
      return;
    }

    // The requesting user's institution: require InstitutionAdmin user
    const user = (req as any).user;
    const instId = user.institution;

    // Ensure institution exists
    const inst = await Institution.findById(instId);
    if (!inst) {
      res.status(400).json({ message: "User institution not found" });
      return;
    }

    const result = await loadStudentsFromExcel(file.buffer, instId);
    res.json({ message: "Import completed", result });
  } catch (err: any) {
    res.status(500).json({ message: err.message || String(err) });
  }
};
