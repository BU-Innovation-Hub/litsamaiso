import bcrypt from "bcryptjs";
import { Institution, type InstitutionBilling } from "../models/Institution.js";
import { Role } from "../models/Role.js";
import { User } from "../models/User.js";
import AppError from "../utils/errors.js";
import type { InstitutionTheme } from "../utils/themePalette.js";

export interface ProvisionInstitutionInput {
  institution: {
    name: string;
    email: string;
    phone?: string | undefined;
    address?: string | undefined;
    website?: string | undefined;
    country?: string | undefined;
  };
  admin: {
    name?: string | undefined;
    email: string;
    /** Plain password (AppAdmin-created) or an existing bcrypt hash (onboarding). */
    password?: string | undefined;
    passwordHash?: string | undefined;
  };
  billing?: InstitutionBilling;
  theme?: InstitutionTheme | undefined;
  onboarded?: boolean;
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Case-insensitive lookup, since older records were stored without lowercasing. */
const emailMatcher = (email: string) => new RegExp(`^${escapeRegex(email.trim())}$`, "i");

export const isInstitutionEmailTaken = async (email: string) =>
  Boolean(await Institution.exists({ email: emailMatcher(email) }));

export const isUserEmailTaken = async (email: string) =>
  Boolean(await User.exists({ email: emailMatcher(email) }));

/**
 * Creates an institution and its first InstitutionAdmin. If creating the admin
 * fails, the institution is removed again so no orphan is left behind.
 */
export const provisionInstitution = async (input: ProvisionInstitutionInput) => {
  const institutionEmail = normalizeEmail(input.institution.email);
  const adminEmail = normalizeEmail(input.admin.email);

  if (!input.admin.password && !input.admin.passwordHash) {
    throw new AppError("adminEmail and adminPassword are required");
  }
  if (await isInstitutionEmailTaken(institutionEmail)) {
    throw new AppError("Institution email already exists", 409);
  }
  if (await isUserEmailTaken(adminEmail)) {
    throw new AppError("Admin user email already exists", 409);
  }

  const role = await Role.findOne({ name: /^InstitutionAdmin$/i });
  if (!role) {
    throw new AppError("Missing required role: InstitutionAdmin", 500);
  }

  const institution = await Institution.create({
    name: input.institution.name.trim(),
    email: institutionEmail,
    phone: input.institution.phone,
    address: input.institution.address,
    website: input.institution.website,
    country: input.institution.country,
    billing: input.billing ?? { status: "manual" },
    theme: input.theme,
    onboardedAt: input.onboarded ? new Date() : undefined,
  });

  try {
    const passwordHash = input.admin.passwordHash ?? (await bcrypt.hash(String(input.admin.password), 10));
    const admin = new User({
      email: adminEmail,
      password: passwordHash,
      role: role._id,
      institution: institution._id,
    });
    const adminName = input.admin.name?.trim();
    if (adminName) admin.name = adminName;
    await admin.save();
    return { institution, admin, role };
  } catch (err) {
    await Institution.deleteOne({ _id: institution._id }).catch(() => undefined);
    throw err;
  }
};
