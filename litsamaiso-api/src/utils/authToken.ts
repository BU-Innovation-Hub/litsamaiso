import jwt from "jsonwebtoken";
import type { Secret, SignOptions } from "jsonwebtoken";

export const signToken = (userId: string, rememberMe: boolean): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not set");
  }

  const defaultExpiry = process.env.JWT_EXPIRES_IN;
  const expiry = rememberMe ? "30d" : defaultExpiry;

  return jwt.sign({ sub: userId }, secret as Secret, {
    expiresIn: expiry as Exclude<SignOptions["expiresIn"], undefined>,
  });
};
