import type { Request, Response, NextFunction } from "express";

export const createRateLimit = (options: {
  windowMs: number;
  max: number;
  keyPrefix?: string;
}) => {
  const hits = new Map<string, { count: number; resetAt: number }>();
  const prefix = options.keyPrefix || "rate";
  // Middleware function to enforce rate limiting based on user ID and IP address
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.headers["x-forwarded-for"] || "unknown";
    const userId = (req as any).user?._id?.toString?.() || "anon";
    const key = `${prefix}:${userId}:${ip}`;

    const now = Date.now();
    const existing = hits.get(key);
    // If no existing record or the reset time has passed, start a new window
    if (!existing || existing.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + options.windowMs });
      next();
      return;
    }
    // If the request count exceeds the maximum allowed, respond with 429 Too Many Requests
    if (existing.count >= options.max) {
      const retryAfter = Math.ceil((existing.resetAt - now) / 1000);
      res.setHeader("Retry-After", String(retryAfter));
      res.status(429).json({ message: "Too many requests" });
      return;
    }

    existing.count += 1;
    hits.set(key, existing);
    next();
  };
};

export default createRateLimit;
