import { type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { Secret, SignOptions } from "jsonwebtoken";

import { Role } from "../models/Role.js";
import { User } from "../models/User.js";
import { Institution } from "../models/Institution.js";
import { Student } from "../models/Student.js";
import { Account } from "../models/Account.js";
import { sendPasswordResetEmail } from "../utils/email.js";
import { createHash, randomBytes } from "crypto";

const signToken = (userId: string, rememberMe: boolean): string => {
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
    contractNumber,
    studentCardUrl,
    faceImageBase64,
    faceDescriptor,
    faceImageUrl,
  } = req.body as {
    email?: string;
    password?: string;
    role?: string;
    institutionId?: string;
    institutionName?: string;
    institutionEmail?: string;
    studentId?: string;
    contractNumber?: string;
    studentCardUrl?: string;
    faceImageBase64?: string;
    faceDescriptor?: number[];
    faceImageUrl?: string;
  };

  if (!email || !password || !role) {
    res.status(400).json({ message: "email, password, and role are required" });
    return;
  }

  const existingUser = await User.findOne({ email });
  if (existingUser) {
    res.status(409).json({ message: "Email already exists" });
    return;
  }

  // Find role case-insensitively to avoid mismatches like "Student" vs "student"
  const roleDoc = await Role.findOne({ name: new RegExp(`^${role}$`, "i") });
  if (!roleDoc) {
    const available = await Role.find().select("name -_id").lean();
    const names = available.map((r: any) => r.name).join(", ");
    res
      .status(400)
      .json({ message: `Role not found. Available roles: ${names}` });
    return;
  }

  let institution = null;

  const roleName = String(roleDoc.name || "").toLowerCase();
  if (roleName === "institutionadmin") {
    if (!institutionName || !institutionEmail) {
      res.status(400).json({
        message:
          "institutionName and institutionEmail are required for InstitutionAdmin",
      });
      return;
    }

    const existingInstitution = await Institution.findOne({
      email: institutionEmail,
    });
    if (existingInstitution) {
      res.status(409).json({ message: "Institution email already exists" });
      return;
    }

    institution = await Institution.create({
      name: institutionName,
      email: institutionEmail,
    });
  } else {
    // If the registrant is a Student and provided a studentId, determine the institution from that record
    if (roleName === "student" && studentId) {
      const studentRecord = await Student.findOne({ studentId }).lean();
      if (!studentRecord) {
        res.status(400).json({
          message:
            "Make sure you are registered first by your Institution Admin in the System",
        });
        return;
      }

      institution = await Institution.findById(studentRecord.institution);
      if (!institution) {
        res.status(400).json({ message: "Institution not found" });
        return;
      }
    } else {
      if (!institutionId) {
        res.status(400).json({ message: "institutionId is required" });
        return;
      }

      institution = await Institution.findById(institutionId);
      if (!institution) {
        res.status(400).json({ message: "Institution not found" });
        return;
      }
    }
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  // If registering as a Student, validate against records loaded by the InstitutionAdmin
  if (roleName === "student") {
    if (studentId) {
      // studentId provided -> find the student record globally and use its institution
      const studentRecord = await Student.findOne({ studentId }).lean();
      if (!studentRecord) {
        res.status(400).json({
          message:
            "Make sure you are registered first by your Institution Admin in the System",
        });
        return;
      }

      // ensure email matches the record
      if (
        String(studentRecord.email).toLowerCase() !==
        String(email).toLowerCase()
      ) {
        res.status(400).json({
          message: "Email and the studentId must belong to the same person",
        });
        return;
      }

      // validate contractNumber exists in the Account collection for this institution
      if (contractNumber) {
        const accountExists = await Account.findOne({
          institution: studentRecord.institution,
          contractNumber: String(contractNumber).trim(),
        });
        if (!accountExists) {
          res.status(400).json({
            message:
              "Contract number not found in the accounts list. Please check and try again.",
          });
          return;
        }

        // save contractNumber to the student record
        await Student.findOneAndUpdate(
          { studentId },
          { contractNumber: String(contractNumber).trim() },
        );
      }
    } else {
      // no studentId -> institution must have been provided and validated earlier
      const studentByEmail = await Student.findOne({
        institution: institution._id,
        email,
      }).lean();
      if (!studentByEmail) {
        res.status(400).json({
          message:
            "Make sure you are registered first by your Institution Admin in the System",
        });
        return;
      }
      // if they later provide studentId it will be checked; here we accept matching email record
    }
  }

  const userData: {
    email: string;
    password: string;
    role: typeof roleDoc._id;
    institution: typeof institution._id;
    studentId?: string;
    contractNumber?: string;
    studentCardUrl?: string;
    faceDescriptor?: number[];
    faceImageUrl?: string;
  } = {
    email,
    password: hashedPassword,
    role: roleDoc._id,
    institution: institution._id,
  };

  if (studentId) {
    userData.studentId = studentId;
  }

  if (contractNumber) {
    userData.contractNumber = String(contractNumber).trim();
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
    user: {
      id: user._id,
      email: user.email,
      role: roleDoc.name,
      institution: institution._id,
      studentId: user.studentId,
      contractNumber: user.contractNumber,
      studentCardUrl: user.studentCardUrl,
      faceDescriptor: user.faceDescriptor,
      faceImageUrl: user.faceImageUrl,
    },
  });
};

export const login = async (req: Request, res: Response): Promise<void> => {
  const { email, password, rememberMe } = req.body as {
    email?: string;
    password?: string;
    rememberMe?: boolean;
  };

  if (!email || !password) {
    res.status(400).json({ message: "email and password are required" });
    return;
  }

  const user = await User.findOne({ email })
    .select("+password")
    .populate("role", "name")
    .populate("institution", "name email");
  if (!user) {
    res.status(401).json({ message: "Invalid credentials" });
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
      email: user.email,
      role: user.role,
      institution: user.institution,
      studentId: user.studentId,
      studentCardUrl: user.studentCardUrl,
      faceDescriptor: user.faceDescriptor,
      faceImageUrl: user.faceImageUrl,
    },
  });
};

export const requestPasswordReset = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { email } = req.body as { email?: string };

  if (!email) {
    res.status(400).json({ message: "email is required" });
    return;
  }

  const user = await User.findOne({ email });
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
      ? `${resetBase}/reset-password?token=${rawToken}&email=${encodeURIComponent(email)}`
      : rawToken;

    await sendPasswordResetEmail({
      to: email,
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

  if (!email || !token || !password) {
    res
      .status(400)
      .json({ message: "email, token, and password are required" });
    return;
  }

  const tokenHash = hashResetToken(token);
  const user = await User.findOne({
    email,
    passwordResetTokenHash: tokenHash,
    passwordResetTokenExpiresAt: { $gt: new Date() },
  }).select("+passwordResetTokenHash +passwordResetTokenExpiresAt");

  if (!user) {
    res.status(400).json({ message: "Invalid or expired reset token" });
    return;
  }

  user.password = await bcrypt.hash(password, 10);
  await user.save();
  await User.updateOne(
    { _id: user._id },
    {
      $unset: {
        passwordResetTokenHash: 1,
        passwordResetTokenExpiresAt: 1,
      },
    },
  );

  res.json({ message: "Password reset successful" });
};
