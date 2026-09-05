import "dotenv/config";
import mongoose from "mongoose";
import { connectDatabase } from "../config/database.js";
import { AuditLog } from "../models/AuditLog.js";
import { Student } from "../models/Student.js";
import { User } from "../models/User.js";
import { Role } from "../models/Role.js";

const shouldApply = process.argv.includes("--apply") && process.argv.includes("--confirm");

const run = async () => {
  await connectDatabase();
  const students: any[] = await Student.find({ borrowerNumber: { $exists: true, $nin: ["", null] } }).lean();
  const synced: Array<Record<string, string>> = [];
  const conflicts: Array<Record<string, string>> = [];
  const missingUsers: Array<Record<string, string>> = [];

  for (const student of students) {
    const user: any = await User.findOne({ institution: student.institution, studentId: student.studentId }).populate("role", "name").lean();
    const role = String(user?.role?.name || user?.role || "").toLowerCase();
    if (!user || (role && role !== "student")) {
      missingUsers.push({ studentId: String(student.studentId), borrowerNumber: String(student.borrowerNumber) });
      continue;
    }
    if (user.borrowerNumber && String(user.borrowerNumber).trim() !== String(student.borrowerNumber).trim()) {
      conflicts.push({ studentId: String(student.studentId), userId: String(user._id), studentBorrowerNumber: String(student.borrowerNumber), userBorrowerNumber: String(user.borrowerNumber) });
      continue;
    }
    if (!user.borrowerNumber) synced.push({ studentId: String(student.studentId), userId: String(user._id), borrowerNumber: String(student.borrowerNumber) });
  }

  console.log(JSON.stringify({ dryRun: !shouldApply, candidateCount: synced.length, conflictCount: conflicts.length, missingUserCount: missingUsers.length, synced, conflicts, missingUsers }, null, 2));

  if (shouldApply && synced.length) {
    for (const item of synced) {
      await User.updateOne({ _id: item.userId, borrowerNumber: { $in: [null, ""] } }, { $set: { borrowerNumber: item.borrowerNumber } });
    }
    await AuditLog.create({ action: "registry.borrower.backfill", targetCollection: "User", details: { synced } });
  }
  await mongoose.disconnect();
};

run().catch(async (error) => { console.error(error); await mongoose.disconnect(); process.exitCode = 1; });
