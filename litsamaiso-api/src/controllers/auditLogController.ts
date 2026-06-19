import type { Request, Response } from "express";
import { AuditLog } from "../models/AuditLog.js";
import mongoose from "mongoose";

const toEJSON = (value: unknown): unknown => {
  if (value instanceof mongoose.Types.ObjectId) {
    return { $oid: value.toHexString() };
  }
  if (value instanceof Date) {
    return { $date: value.toISOString() };
  }
  if (Array.isArray(value)) {
    return value.map(toEJSON);
  }
  if (value !== null && typeof value === "object") {
    const obj: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      obj[k] = toEJSON(v);
    }
    return obj;
  }
  return value;
};

export const listAuditLogs = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { page, limit, search, action, startDate, endDate } = req.query as any;

    const query: any = {};
    if (search) {
      const rx = { $regex: String(search), $options: "i" };
      query.$or = [
        { action: rx },
        { actorEmail: rx },
        { actorRole: rx },
        { targetCollection: rx },
        { targetId: rx },
        { "details.path": rx },
        { "details.method": rx },
      ];
    }
    if (action) {
      query.action = { $regex: String(action), $options: "i" };
    }
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.createdAt.$lte = end;
      }
    }

    const pageNum = Math.max(parseInt(page) || 1, 1);
    const lim = Math.max(Math.min(parseInt(limit) || 50, 500), 1);
    const skip = (pageNum - 1) * lim;

    const [auditLogs, total] = await Promise.all([
      AuditLog.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(lim),
      AuditLog.countDocuments(query),
    ]);

    res.json({
      auditLogs,
      page: pageNum,
      limit: lim,
      total,
      pages: Math.ceil(total / lim),
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message || "Failed to fetch audit logs" });
  }
};

export const exportAuditLogs = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const logs = await AuditLog.find().sort({ createdAt: -1 }).lean();
    const ejson = logs.map((log) => toEJSON(log));
    const text = JSON.stringify(ejson, null, 2);
    res.setHeader("Content-Type", "text/plain");
    res.setHeader("Content-Disposition", "attachment; filename=audit-logs.txt");
    res.send(text);
  } catch (err: any) {
    res.status(500).json({ message: err.message || "Failed to export audit logs" });
  }
};
