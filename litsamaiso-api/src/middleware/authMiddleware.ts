import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { User } from "../models/User.js";
import { Role } from "../models/Role.js";
import { ACTIVE_ROLE_HEADER, activeRoleName, holdsRole } from "../utils/activeRole.js";

interface JwtPayload {
  sub: string;
  iat?: number;
  exp?: number | string;
}

export const requireAuth = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res
      .status(401)
      .json({ message: "Missing or invalid Authorization header" });
    return;
  }

  const token = authHeader.split(" ")[1];
  const secret = process.env.JWT_SECRET as string;
  if (!secret) {
    res.status(500).json({ message: "JWT_SECRET not configured" });
    return;
  }

  try {
    const decoded = jwt.verify(token as string, String(secret)) as JwtPayload;
    const user = await User.findById(decoded.sub).populate("role").populate("additionalRoles");
    if (!user) {
      res.status(401).json({ message: "User not found" });
      return;
    }

    // A user who holds several roles says which one this request is made as. Asking for a role
    // they don't hold (or no longer hold) is refused rather than quietly falling back.
    const requested = req.headers[ACTIVE_ROLE_HEADER];
    if (typeof requested === "string" && requested.trim()) {
      const wanted = requested.trim().toLowerCase();
      const primary = String((user.role as any)?.name || "").toLowerCase();
      if (wanted !== primary) {
        const held = ((user.additionalRoles ?? []) as any[]).find(
          (role) => String(role?.name || "").toLowerCase() === wanted,
        );
        if (!held) {
          res.status(403).json({
            message: "You no longer hold this role",
            code: "ACTIVE_ROLE_NOT_HELD",
          });
          return;
        }
        user.$locals.activeRole = held.name;
      }
    }

    // attach user to request for downstream handlers
    (req as any).user = user;
    next();
  } catch (err) {
    res.status(401).json({ message: "Invalid token" });
  }
};

export const requireRole = (roles: string[] | string) => {
  const allowed = Array.isArray(roles) ? roles : [roles];
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;
    if (!user) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    // The role this request is made as (see requireAuth), whether populated or a string
    const roleName = activeRoleName(user).toLowerCase();

    // Compare allowed roles case-insensitively
    const allowedLower = allowed.map((r) => String(r).toLowerCase());
    if (!allowedLower.includes(roleName)) {
      res.status(403).json({ message: "Forbidden" });
      return;
    }

    next();
  };
};

// The IEC runs the election, so its members can't vote in it, even from their Student dashboard.
// Leaving the IEC lets them vote again, since membership is read fresh on every request.
export const refuseIecVoters = (req: Request, res: Response, next: NextFunction) => {
  if (holdsRole((req as any).user, "IEC")) {
    res.status(403).json({
      message: "IEC members can't vote while they're on the IEC",
      code: "IEC_MEMBER_CANNOT_VOTE",
    });
    return;
  }
  next();
};
