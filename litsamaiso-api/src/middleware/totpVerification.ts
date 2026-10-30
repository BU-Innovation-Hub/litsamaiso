import type { Request, Response, NextFunction } from "express";
import { hasValidPhotoCaptureGrant, isTotpRequired } from "../services/totpService.js";

export const PHOTO_CAPTURE_GRANT_HEADER = "x-photo-capture-grant";

export const isStudentUser = (user: any): boolean =>
  String((user?.role && user.role.name) || user?.role || "").toLowerCase() === "student";

// A student's profile photo is what their face is checked against when voting, so changing it
// needs a code from their authenticator app, unless their institution has turned it off.
// Other roles save their photo as before.
export const requirePhotoCaptureGrant = async (req: Request, res: Response, next: NextFunction) => {
  const user = (req as any).user;
  if (!isStudentUser(user) || !(await isTotpRequired(user.institution))) {
    next();
    return;
  }

  const grant = req.headers[PHOTO_CAPTURE_GRANT_HEADER];
  if (typeof grant !== "string" || !grant || !(await hasValidPhotoCaptureGrant(String(user._id), grant))) {
    res.status(403).json({
      message: "Enter a code from your authenticator app before taking your photo",
      code: "PHOTO_CAPTURE_GRANT_REQUIRED",
    });
    return;
  }

  // The photo save spends the grant in the same write, so one code saves one photo
  res.locals.photoCaptureGrant = grant;
  next();
};

// No keys or grants are created while an institution has the authenticator app turned off
export const requireTotpInstitution = async (req: Request, res: Response, next: NextFunction) => {
  if (await isTotpRequired((req as any).user?.institution)) {
    next();
    return;
  }

  res.status(409).json({
    message: "Your institution doesn't use an authenticator app.",
    code: "TOTP_DISABLED",
  });
};
