import { type Request, type Response } from "express";
import bcrypt from "bcryptjs";

import { Role } from "../models/Role.js";
import { User } from "../models/User.js";
import { Institution } from "../models/Institution.js";
import { Student } from "../models/Student.js";
import { sendPasswordResetEmail } from "../utils/email.js";
import { signToken } from "../utils/authToken.js";
import { SESSION_INSTITUTION_FIELDS } from "../utils/sessionUser.js";
import { createHash, randomBytes } from "crypto";
import {
  getFriendlyRegistrationErrorMessage,
  getPublicRegistrationError,
  isPrivilegedRole,
  isPublicRegistrationAllowed,
  normalizeRoleName,
} from "./registrationPolicy.js";

const hashResetToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");

const getPasswordResetBaseUrl = (): string => {
  const configuredUrl = process.env.PASSWORD_RESET_BASE_URL;
  if (configuredUrl) {
    return configuredUrl.replace(/\/$/, "");
  }

  return "";
};

export const register = async (req: Request, res: Response): Promise<void> => {
  const {
    email,
    password,
    role,
    institutionId,
    institutionName,
    institutionEmail,
    studentId,
    studentCardUrl,
    faceImageBase64,
    faceDescriptor,
    faceImageUrl,
    financialInfoConsent,
  } = req.body as {
    email?: string;
    password?: string;
    role?: string;
    institutionId?: string;
    institutionName?: string;
    institutionEmail?: string;
    studentId?: string;
    studentCardUrl?: string;
    faceImageBase64?: string;
    faceDescriptor?: number[];
    faceImageUrl?: string;
    financialInfoConsent?: boolean;
  };

  const normalizedEmail =
    typeof email === "string" ? email.trim().toLowerCase() : "";
  const normalizedInstitutionEmail =
    typeof institutionEmail === "string"
      ? institutionEmail.trim().toLowerCase()
      : "";

  if (!normalizedEmail || !password || !role) {
    res.status(400).json({ message: getFriendlyRegistrationErrorMessage("missingFields") });
    return;
  }

  if (financialInfoConsent !== true) {
    res.status(400).json({ message: getFriendlyRegistrationErrorMessage("consentRequired") });
    return;
  }

  const existingUser = await User.findOne({ email: normalizedEmail });
  if (existingUser) {
    res.status(409).json({ message: getFriendlyRegistrationErrorMessage("emailTaken") });
    return;
  }

  // Find role case-insensitively to avoid mismatches like "Student" vs "student"
  const roleDoc = await Role.findOne({ name: new RegExp(`^${role}$`, "i") });
  if (!roleDoc) {
    res.status(400).json({ message: getFriendlyRegistrationErrorMessage("unsupportedRole") });
    return;
  }

  const roleName = normalizeRoleName(String(roleDoc.name || ""));
  if (isPrivilegedRole(roleName) && !isPublicRegistrationAllowed(roleName)) {
    const error = getPublicRegistrationError(roleName);
    res.status(error.status).json({ message: error.message });
    return;
  }

  let institution = null;
  if (roleName === "institutionadmin") {
    if (!institutionName || !normalizedInstitutionEmail) {
      res.status(400).json({
        message: getFriendlyRegistrationErrorMessage("institutionDetailsRequired"),
      });
      return;
    }

    const existingInstitution = await Institution.findOne({
      email: normalizedInstitutionEmail,
    });
    if (existingInstitution) {
      res.status(409).json({ message: getFriendlyRegistrationErrorMessage("emailTaken") });
      return;
    }

    institution = await Institution.create({
      name: institutionName,
      email: normalizedInstitutionEmail,
    });
  } else {
    // If the registrant is a Student and provided a studentId, determine the institution from that record
    if (roleName === "student" && studentId) {
      const studentRecord = await Student.findOne({ studentId }).lean();
      if (!studentRecord) {
        res.status(400).json({
          message: getFriendlyRegistrationErrorMessage("studentNotFound"),
        });
        return;
      }

      institution = await Institution.findById(studentRecord.institution);
      if (!institution) {
        res.status(400).json({ message: getFriendlyRegistrationErrorMessage("institutionUnavailable") });
        return;
      }
    } else {
      if (!institutionId) {
        res.status(400).json({ message: getFriendlyRegistrationErrorMessage("institutionUnavailable") });
        return;
      }

      institution = await Institution.findById(institutionId);
      if (!institution) {
        res.status(400).json({ message: getFriendlyRegistrationErrorMessage("institutionUnavailable") });
        return;
      }
    }
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  let borrowerNumberForUser: string | undefined;

  // If registering as a Student, validate against records loaded by the InstitutionAdmin
  if (roleName === "student") {
    if (studentId) {
      // studentId provided -> find the student record globally and use its institution
      const studentRecord = await Student.findOne({ studentId }).lean();
      if (!studentRecord) {
        res.status(400).json({
          message: getFriendlyRegistrationErrorMessage("studentNotFound"),
        });
        return;
      }

      // ensure email matches the record
      if (
        String(studentRecord.email).toLowerCase() !==
        normalizedEmail
      ) {
        res.status(400).json({
          message: getFriendlyRegistrationErrorMessage("studentMismatch"),
        });
        return;
      }

      // use borrowerNumber from the Student record (imported via spreadsheet) if available
      const studentBorrowerNumber = studentRecord.borrowerNumber;
      if (studentBorrowerNumber) {
        borrowerNumberForUser = studentBorrowerNumber;
      }
    } else {
      // no studentId -> institution must have been provided and validated earlier
      const studentByEmail = await Student.findOne({
        institution: institution._id,
        email: normalizedEmail,
      }).lean();
      if (!studentByEmail) {
        res.status(400).json({
          message: getFriendlyRegistrationErrorMessage("studentNotFound"),
        });
        return;
      }

      // use borrowerNumber from the Student record if available
      const studentBorrowerNumber = studentByEmail.borrowerNumber;
      if (studentBorrowerNumber) {
        borrowerNumberForUser = studentBorrowerNumber;
      }
    }
  }

  const userData: {
    email: string;
    password: string;
    role: typeof roleDoc._id;
    institution: typeof institution._id;
    studentId?: string;
    borrowerNumber?: string;
    studentCardUrl?: string;
    faceDescriptor?: number[];
    faceImageUrl?: string;
    financialInfoConsentAt?: Date;
  } = {
    email: normalizedEmail,
    password: hashedPassword,
    role: roleDoc._id,
    institution: institution._id,
    financialInfoConsentAt: new Date(),
  };

  if (studentId) {
    userData.studentId = studentId;
  }

  if (borrowerNumberForUser) {
    userData.borrowerNumber = borrowerNumberForUser;
  }

  if (studentCardUrl) {
    userData.studentCardUrl = studentCardUrl;
  }

  if (Array.isArray(faceDescriptor)) {
    userData.faceDescriptor = faceDescriptor;
  }

  if (faceImageUrl) {
    userData.faceImageUrl = faceImageUrl;
  }

  const user = await User.create(userData);

  res.status(201).json({
    message: "User registered",
  });
};

export const login = async (req: Request, res: Response): Promise<void> => {
  const { email, studentId, password, rememberMe } = req.body as {
    email?: string;
    studentId?: string;
    password?: string;
    rememberMe?: boolean;
  };

  const normalizedEmail =
    typeof email === "string" ? email.trim().toLowerCase() : "";
  const normalizedStudentId =
    typeof studentId === "string" ? studentId.trim() : "";

  const identifier = normalizedEmail || normalizedStudentId;
  if (!identifier || !password) {
    res.status(400).json({ message: "email or studentId and password are required" });
    return;
  }

  const isEmail = Boolean(normalizedEmail);
  const user = await User.findOne(
    isEmail ? { email: normalizedEmail } : { studentId: normalizedStudentId },
  )
    .select("+password")
    .populate("role", "name")
    .populate("institution", SESSION_INSTITUTION_FIELDS);
  if (!user) {
    res.status(401).json({ message: "Invalid credentials" });
    return;
  }

  if ((user.institution as any)?.locked) {
    res.status(403).json({
      message: "Your institution account has been locked",
      locked: true,
      lockedReason: (user.institution as any).lockedReason || undefined,
      lockedBy: (user.institution as any).lockedBy || undefined,
    });
    return;
  }

  const passwordMatches = await bcrypt.compare(password, user.password);
  if (!passwordMatches) {
    res.status(401).json({ message: "Invalid credentials" });
    return;
  }

  const token = signToken(user._id.toString(), Boolean(rememberMe));

  res.json({
    message: "Login successful",
    token,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      institution: user.institution,
      studentId: user.studentId,
      borrowerNumber: user.borrowerNumber,
      studentCardUrl: user.studentCardUrl,
      faceDescriptor: user.faceDescriptor,
      faceImageUrl: user.faceImageUrl,
      financialInfoConsentAt: user.financialInfoConsentAt,
      tour: user.tour,
    },
  });
};

export const requestPasswordReset = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { email } = req.body as { email?: string };
  const normalizedEmail =
    typeof email === "string" ? email.trim().toLowerCase() : "";

  if (!normalizedEmail) {
    res.status(400).json({ message: "email is required" });
    return;
  }

  const user = await User.findOne({ email: normalizedEmail });
  if (user) {
    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = hashResetToken(rawToken);
    const expiresAt = new Date(Date.now() + 1000 * 60 * 30);

    user.passwordResetTokenHash = tokenHash;
    user.passwordResetTokenExpiresAt = expiresAt;
    await user.save();

    const baseUrl = getPasswordResetBaseUrl();
    const origin = req.get("origin")?.replace(/\/$/, "") || "";
    const resetBase = baseUrl || origin;
    const resetLink = resetBase
      ? `${resetBase}/reset-password?token=${rawToken}&email=${encodeURIComponent(normalizedEmail)}`
      : rawToken;

    await sendPasswordResetEmail({
      to: normalizedEmail,
      resetLink,
    });
  }

  res.json({
    message:
      "If an account exists for that email, a password reset link has been sent",
  });
};

export const resetPassword = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { email, token, password } = req.body as {
    email?: string;
    token?: string;
    password?: string;
  };
  const normalizedEmail =
    typeof email === "string" ? email.trim().toLowerCase() : "";

  if (!normalizedEmail || !token || !password) {
    res
      .status(400)
      .json({ message: "email, token, and password are required" });
    return;
  }

  const tokenHash = hashResetToken(token);
  const user = await User.findOne({
    email: normalizedEmail,
    passwordResetTokenHash: tokenHash,
    passwordResetTokenExpiresAt: { $gt: new Date() },
  }).select("+passwordResetTokenHash +passwordResetTokenExpiresAt");

  if (!user) {
    res.status(400).json({ message: "Invalid or expired reset token" });
    return;
  }

  user.password = await bcrypt.hash(password, 10);
  user.passwordResetTokenHash = undefined as any;
  user.passwordResetTokenExpiresAt = undefined as any;
  await user.save();

  res.json({ message: "Password reset successful" });
};
