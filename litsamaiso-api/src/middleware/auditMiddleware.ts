import type { Request, Response, NextFunction } from "express";
import { recordAudit } from "../utils/auditLog.js";

export const auditMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const start = Date.now();
  const requestId = (req as any).requestId;

  const bodyKeys =
    req.body && typeof req.body === "object" && !Array.isArray(req.body)
      ? Object.keys(req.body as Record<string, unknown>)
      : [];
  const queryKeys = Object.keys(req.query || {});

  res.on("finish", async () => {
    const duration = Date.now() - start;
    const actor = (req as any).user;
    const actorId = actor?._id?.toString?.();
    const actorEmail = actor?.email;
    const actorRole =
      (actor && ((actor.role && (actor.role as any).name) as string)) ||
      actor?.role;

    const details: Record<string, unknown> = {
      path: req.originalUrl,
      method: req.method,
      status: res.statusCode,
      durationMs: duration,
    };
    if (requestId) details.requestId = requestId;
    if (queryKeys.length) details.queryKeys = queryKeys;
    if (bodyKeys.length) details.bodyKeys = bodyKeys;

    try {
      const payload: {
        action: string;
        actorId?: string;
        actorEmail?: string;
        actorRole?: string;
        details?: Record<string, any>;
      } = { action: `http.${req.method.toLowerCase()}` };
      if (actorId) payload.actorId = actorId;
      if (actorEmail) payload.actorEmail = actorEmail;
      if (actorRole) payload.actorRole = actorRole;
      payload.details = details as Record<string, any>;

      await recordAudit(payload);
    } catch (err) {
      console.error("auditMiddleware failed to record audit:", err);
    }
  });

  next();
};

export default auditMiddleware;
