import type { Request, Response } from "express";
import { loadStudentsFromExcel } from "../services/studentService.js";
import { Institution } from "../models/Institution.js";

export const uploadStudents = async (req: Request, res: Response) => {
  const wantsStream =
    req.query.stream === "1" ||
    String(req.headers.accept || "").includes("application/x-ndjson");

  const writeStreamEvent = (event: Record<string, unknown>) => {
    res.write(`${JSON.stringify(event)}\n`);
  };

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

    if (wantsStream) {
      res.status(200);
      res.setHeader("Content-Type", "application/x-ndjson");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders?.();

      writeStreamEvent({
        type: "started",
        message: "Reading spreadsheet",
        processed: 0,
        total: 0,
        inserted: 0,
        skipped: 0,
        errors: 0,
        percent: 0,
      });

      const result = await loadStudentsFromExcel(file.buffer, instId, (progress) => {
        writeStreamEvent({
          type: "progress",
          message: "Importing student records",
          ...progress,
        });
      });

      writeStreamEvent({
        type: "completed",
        message: "Import completed",
        result,
        processed: result.total,
        total: result.total,
        inserted: result.inserted,
        skipped: result.skipped,
        errors: result.errors.length,
        percent: 100,
      });
      res.end();
      return;
    }

    const result = await loadStudentsFromExcel(file.buffer, instId);
    res.json({ message: "Import completed", result });
  } catch (err: any) {
    if (wantsStream && res.headersSent) {
      writeStreamEvent({
        type: "error",
        message: err.message || String(err),
        percent: 100,
      });
      res.end();
      return;
    }

    res.status(500).json({ message: err.message || String(err) });
  }
};
