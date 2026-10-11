import dotenv from "dotenv";
dotenv.config();

import express from "express";
import type { Request, Response, NextFunction } from "express";
import cors from "cors";
import mongoose from "mongoose";
import { randomUUID } from "crypto";

import { connectDatabase } from "./config/database.js";
import { getPosthogClient, shutdownPosthog } from "./services/posthogService.js";
import { setupExpressRequestContext, setupExpressErrorHandler } from "posthog-node";
import { API_V1_PREFIX, apiNotFoundHandler, registerApiRoutes } from "./routes/apiRoutes.js";
import auditMiddleware from "./middleware/auditMiddleware.js";
import { seedRolesAndAdmin } from "./utils/seed.js";
import { initAgenda } from "./scheduler/agenda.js";
import { stripeWebhook } from "./controllers/webhookController.js";


const app = express();

const posthog = getPosthogClient();
setupExpressRequestContext(posthog, app);

const parseTrustProxy = (value: string | undefined): boolean | number | string => {
  if (!value) {
    return process.env.NODE_ENV === "production" ? 1 : false;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;

  const numericValue = Number(normalized);
  return Number.isInteger(numericValue) ? numericValue : value;
};

app.set("trust proxy", parseTrustProxy(process.env.TRUST_PROXY));
app.set("etag", false);
app.use(cors());
// Stripe webhooks are verified against the raw body, so this route must be
// registered before the JSON parser. It is mounted once, outside the v1 table.
app.post(`${API_V1_PREFIX}/webhooks/stripe`, express.raw({ type: "application/json" }), stripeWebhook);
// Allow larger JSON payloads (base64 images for AI validation)
app.use(express.json({ limit: "10mb" }));

app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.method === "GET") {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Surrogate-Control", "no-store");
  }
  next();
});

const REDACT_KEYS = new Set([
  "password",
  "token",
  "refreshToken",
  "authorization",
]);
const getBodySummary = (body: unknown): Record<string, string> | undefined => {
  if (!body || typeof body !== "object" || Array.isArray(body))
    return undefined;
  const summary: Record<string, string> = {};
  for (const key of Object.keys(body as Record<string, unknown>)) {
    summary[key] = REDACT_KEYS.has(key.toLowerCase())
      ? "[REDACTED]"
      : "[PRESENT]";
  }
  return summary;
};

// Global request/response logger for debugging
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  const requestId = randomUUID();
  (req as any).requestId = requestId;

  const bodySummary = getBodySummary(req.body);
  const queryKeys = Object.keys(req.query || {});

  console.log(
    `[Req ${requestId}] ${req.method} ${req.originalUrl} - headers: ${Object.keys(req.headers).join(", ")}`,
  );
  if (queryKeys.length > 0) {
    console.log(`[Req ${requestId}] query keys: ${queryKeys.join(", ")}`);
  }
  if (bodySummary && Object.keys(bodySummary).length > 0) {
    console.log(
      `[Req ${requestId}] body keys: ${Object.keys(bodySummary).join(", ")}`,
    );
  }

  res.on("finish", () => {
    const ms = Date.now() - start;
    console.log(
      `[Res ${requestId}] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${ms}ms)`,
    );
  });

  next();
});

// Audit middleware: record an audit log for every request/response
app.use(auditMiddleware);

registerApiRoutes(app);

app.get("/", (req: Request, res: Response) => {
  res.json({
    message: "Express TypeScript API running",
    apiVersions: { v1: API_V1_PREFIX },
  });
});

app.get("/health", (req: Request, res: Response) => {
  const uptimeSeconds = Math.floor(process.uptime());
  const dbState = mongoose.connection.readyState; // 0: disconnected, 1: connected, 2: connecting, 3: disconnecting
  const dbStatus =
    dbState === 1
      ? "connected"
      : dbState === 2
        ? "connecting"
        : dbState === 3
          ? "disconnecting"
          : "disconnected";

  res.json({
    status: "ok",
    uptimeSeconds,
    db: { state: dbState, status: dbStatus },
    timestamp: new Date().toISOString(),
  });
});

app.use(apiNotFoundHandler);

setupExpressErrorHandler(posthog, app);

// Central error logger
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  const requestId = (req as any).requestId || "unknown";
  console.error(`[Err ${requestId}]`, err);
  next(err);
});

const PORT = process.env.PORT || 5000;

const startServer = async (): Promise<void> => {
  try {
    await connectDatabase();
    await seedRolesAndAdmin();
    await initAgenda();

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server", error);
    process.exit(1);
  }
};

void startServer();

process.on("SIGTERM", async () => {
  await shutdownPosthog();
  process.exit(0);
});

process.on("SIGINT", async () => {
  await shutdownPosthog();
  process.exit(0);
});
