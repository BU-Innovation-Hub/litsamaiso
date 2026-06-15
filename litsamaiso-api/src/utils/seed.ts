import bcrypt from "bcryptjs";

import { Institution } from "../models/Institution.js";
import { Role } from "../models/Role.js";
import { User } from "../models/User.js";

const ROLE_NAMES = [
  "AppAdmin",
  "InstitutionAdmin",
  "Finance",
  "SAAD",
  "student",
] as const;

export const seedRolesAndAdmin = async (): Promise<void> => {
  await Role.updateMany({}, { $setOnInsert: {} });

  await Promise.all(
    ROLE_NAMES.map(async (roleName) => {
      await Role.findOneAndUpdate(
        { name: roleName },
        { name: roleName },
        { upsert: true, returnDocument: "after" },
      );
    }),
  );

  const adminEmail = process.env.APP_ADMIN_EMAIL;
  const adminPassword = process.env.APP_ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    console.warn(
      "APP_ADMIN_EMAIL or APP_ADMIN_PASSWORD is not set; skipping AppAdmin seed",
    );
    return;
  }

  const appAdminRole = await Role.findOne({ name: "AppAdmin" });
  if (!appAdminRole) {
    throw new Error("AppAdmin role is missing after seeding");
  }

  const existingAdmin = await User.findOne({ email: adminEmail });
  if (existingAdmin) {
    return;
  }

  const institutionName = process.env.SYSTEM_INSTITUTION_NAME!;
  const institutionEmail =
    process.env.SYSTEM_INSTITUTION_EMAIL!;

  const systemInstitution = await Institution.findOneAndUpdate(
    { email: institutionEmail },
    { name: institutionName, email: institutionEmail },
    { upsert: true, returnDocument: "after" },
  );

  const hashedPassword = await bcrypt.hash(adminPassword, 10);

  await User.create({
    email: adminEmail,
    password: hashedPassword,
    role: appAdminRole._id,
    institution: systemInstitution._id,
  });
};
