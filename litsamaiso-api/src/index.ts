import dotenv from "dotenv";
dotenv.config();

import express from "express";
import type { Request, Response, NextFunction } from "express";
import cors from "cors";
import mongoose from "mongoose";
import { randomUUID } from "crypto";

import { connectDatabase } from "./config/database.js";
import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import studentRoutes from "./routes/studentRoutes.js";
import accountRoutes from "./routes/accountRoutes.js";
import reportRoutes from "./routes/reportRoutes.js";
import feedbackRoutes from "./routes/feedbackRoutes.js";
import electionRoutes from "./routes/electionRoutes.js";
import voteRoutes from "./routes/voteRoutes.js";
import resultRoutes from "./routes/resultRoutes.js";
import aiRoutes from "./routes/aiRoutes.js";
import ocrRoutes from "./routes/ocrRoutes.js";
import uploadRoutes from "./routes/uploadRoutes.js";
import issueRoutes from "./routes/issueRoutes.js";
import auditMiddleware from "./middleware/auditMiddleware.js";
import { seedRolesAndAdmin } from "./utils/seed.js";
import { initAgenda } from "./scheduler/agenda.js";


const app = express();

app.use(cors());
// Allow larger JSON payloads (base64 images for AI validation)
app.use(express.json({ limit: "10mb" }));

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

app.use("/auth", authRoutes);
app.use("/users", userRoutes);
app.use("/students", studentRoutes);
app.use("/accounts", accountRoutes);
app.use("/reports", reportRoutes);
app.use("/feedback", feedbackRoutes);
app.use("/elections", electionRoutes);
app.use("/vote", voteRoutes);
app.use("/results", resultRoutes);
app.use("/ai", aiRoutes);
app.use("/ocr", ocrRoutes);
app.use("/upload", uploadRoutes);
app.use("/issues", issueRoutes);

app.get("/", (req: Request, res: Response) => {
  res.json({
    message: "Express TypeScript API running",
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
