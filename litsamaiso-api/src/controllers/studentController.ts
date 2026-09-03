import type { Request, Response } from "express";
import mongoose from "mongoose";
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

    // Resolve the institution the students belong to.
    // AppAdmin imports on behalf of any institution and must name it explicitly;
    // InstitutionAdmin is always pinned to their own institution.
    const user = (req as any).user;
    const roleName = String(
      (user.role && (user.role as any).name) || (user.role as string) || "",
    ).toLowerCase();

    let instId = user.institution;

    if (roleName === "appadmin") {
      const requestedInstId = String(
        req.body?.institutionId || req.query.institutionId || "",
      ).trim();

      if (!requestedInstId) {
        res
          .status(400)
          .json({ message: "Select the institution to import students into" });
        return;
      }

      if (!mongoose.isValidObjectId(requestedInstId)) {
        res.status(400).json({ message: "Invalid institution id" });
        return;
      }

      instId = requestedInstId;
    } else if (!instId) {
      res.status(400).json({ message: "User institution not found" });
      return;
    }

    // Ensure institution exists
    const inst = await Institution.findById(instId);
    if (!inst) {
      res.status(400).json({ message: "Institution not found" });
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

      const result = await loadStudentsFromExcel(file.buffer, inst._id, (progress) => {
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

    const result = await loadStudentsFromExcel(file.buffer, inst._id);
    const totalRows = result.inserted + result.skipped + result.errors.length;
    res.json({
      message: "Import completed",
      summary: {
        totalRows,
        inserted: result.inserted,
        skipped: result.skipped,
        failed: result.errors.length,
      },
      errors: result.errors,
    });
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
