import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { User } from "../models/User.js";
import { Role } from "../models/Role.js";

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
    const user = await User.findById(decoded.sub).populate("role");
    if (!user) {
      res.status(401).json({ message: "User not found" });
      return;
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

    // Resolve role name whether `user.role` is populated object or a string
    const resolvedRole =
      (user.role && (user.role as any).name) || (user.role as string) || "";
    const roleName = String(resolvedRole).toLowerCase();

    // Compare allowed roles case-insensitively
    const allowedLower = allowed.map((r) => String(r).toLowerCase());
    if (!allowedLower.includes(roleName)) {
      res.status(403).json({ message: "Forbidden" });
      return;
    }

    next();
  };
};
