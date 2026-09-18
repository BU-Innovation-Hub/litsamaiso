import type { Express, Request, Response, NextFunction, Router } from "express";

import authRoutes from "./authRoutes.js";
import userRoutes from "./userRoutes.js";
import studentRoutes from "./studentRoutes.js";
import accountRoutes from "./accountRoutes.js";
import reportRoutes from "./reportRoutes.js";
import feedbackRoutes from "./feedbackRoutes.js";
import electionRoutes from "./electionRoutes.js";
import voteRoutes from "./voteRoutes.js";
import resultRoutes from "./resultRoutes.js";
import aiRoutes from "./aiRoutes.js";
import ocrRoutes from "./ocrRoutes.js";
import uploadRoutes from "./uploadRoutes.js";
import issueRoutes from "./issueRoutes.js";
import institutionRoutes from "./institutionRoutes.js";
import adminIssueRoutes from "./adminIssueRoutes.js";
import profileRoutes from "./profileRoutes.js";
import auditLogRoutes from "./auditLogRoutes.js";
import branchCodeRoutes from "./branchCodeRoutes.js";
import administrativeEmailRoutes from "./administrativeEmailRoutes.js";
import registryRoutes from "./registryRoutes.js";

export const API_V1_PREFIX = "/api/v1";

export type ApiVersion = "v1" | "legacy";

// Date the unversioned paths were deprecated, sent as an RFC 9745 `Deprecation` header.
// No `Sunset` header is sent: no removal date has been decided.
const LEGACY_DEPRECATED_AT = Date.parse("2026-09-18T00:00:00Z") / 1000;

/**
 * The v1 route table. The unversioned legacy paths are pinned to this table, not to
 * "the latest version": when a v2 is introduced it gets its own table and prefix, and
 * the legacy paths keep serving v1 behavior.
 *
 * Both mounts reuse these router instances, so module-level state such as the rate
 * limiters in authRoutes is shared. Building separate routers per prefix would let
 * clients double their rate limit by alternating between the two paths.
 */
export const apiV1Routes: ReadonlyArray<readonly [path: string, router: Router]> = [
  ["/auth", authRoutes],
  ["/profile", profileRoutes],
  ["/users", userRoutes],
  ["/students", studentRoutes],
  ["/accounts", accountRoutes],
  ["/reports", reportRoutes],
  ["/feedback", feedbackRoutes],
  ["/elections", electionRoutes],
  ["/vote", voteRoutes],
  ["/results", resultRoutes],
  ["/ai", aiRoutes],
  ["/ocr", ocrRoutes],
  ["/upload", uploadRoutes],
  ["/issues", issueRoutes],
  ["/admin/issues", adminIssueRoutes],
  ["/audit-logs", auditLogRoutes],
  ["/branch-codes", branchCodeRoutes],
  ["/institutions", institutionRoutes],
  ["/admin/email-composer", administrativeEmailRoutes],
  ["/registry", registryRoutes],
];

const VERSION_PREFIX_ANY_CASE = /^\/api\/v\d+(?:\/|$)/i;
const VERSION_PREFIX_CANONICAL = /^\/api\/v\d+(?:\/|$)/;

export const apiNotFoundHandler = (req: Request, res: Response): void => {
  res.status(404).json({ message: "Not found" });
};

// Express matches paths case-insensitively, so `/API/V1/...` would otherwise be served.
// Only the lowercase version prefix is valid, which keeps edge rules on `/api/v1` sound.
const rejectNonCanonicalVersionPrefix = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  if (VERSION_PREFIX_ANY_CASE.test(req.path) && !VERSION_PREFIX_CANONICAL.test(req.path)) {
    apiNotFoundHandler(req, res);
    return;
  }
  next();
};

const markApiVersion =
  (version: ApiVersion) =>
  (req: Request, res: Response, next: NextFunction): void => {
    res.locals.apiVersion = version;
    next();
  };

const markLegacyRequest = (req: Request, res: Response, next: NextFunction): void => {
  res.locals.apiVersion = "legacy";
  res.setHeader("Deprecation", `@${LEGACY_DEPRECATED_AT}`);
  res.setHeader("Link", `<${API_V1_PREFIX}${req.originalUrl}>; rel="successor-version"`);
  next();
};

export const registerApiRoutes = (app: Express): void => {
  app.use(rejectNonCanonicalVersionPrefix);

  app.get(API_V1_PREFIX, (req: Request, res: Response) => {
    res.json({ version: "v1" });
  });

  for (const [path, router] of apiV1Routes) {
    app.use(`${API_V1_PREFIX}${path}`, markApiVersion("v1"), router);
  }

  for (const [path, router] of apiV1Routes) {
    app.use(path, markLegacyRequest, router);
  }
};
