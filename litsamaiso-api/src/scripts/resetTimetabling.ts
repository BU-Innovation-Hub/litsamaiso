// Erases one institution's Room Allocation data so it can start again: every timetable and its classes,
// every module (in every term), lecturer and room, and the import history. Students, users and everything
// else are left alone.
//
// Without --commit it only counts what would go. It writes to MONGO_URI from .env; a database that isn't on
// this machine also needs --confirm-host=<host>.
//
//   npm run reset:timetabling
//   npm run reset:timetabling -- --institution "Botho University Lesotho" --commit
import dotenv from "dotenv";
dotenv.config();

import mongoose, { type ClientSession, type Types } from "mongoose";
import { connectDatabase, getMongoUri } from "../config/database.js";
import { AuditLog } from "../models/AuditLog.js";
import { ClassSession } from "../models/ClassSession.js";
import { CourseModule } from "../models/CourseModule.js";
import { Lecturer } from "../models/Lecturer.js";
import { Room } from "../models/Room.js";
import { TimetableRun } from "../models/TimetableRun.js";
import { TimetablingImport } from "../models/TimetablingImport.js";
import { withOptionalTransaction } from "../utils/transaction.js";
import { assertHostAllowed, databaseOf, findInstitution, hasFlag, readFlag } from "./scriptSupport.js";

// Classes point at timetables, modules and rooms, and modules at lecturers, so they go in this order
const COLLECTIONS = [
  { label: "timetabled classes", model: ClassSession },
  { label: "timetables", model: TimetableRun },
  { label: "modules (all terms)", model: CourseModule },
  { label: "lecturers", model: Lecturer },
  { label: "rooms", model: Room },
  { label: "import history entries", model: TimetablingImport },
] as const;

type Counts = Record<string, number>;

const count = async (institution: Types.ObjectId): Promise<Counts> =>
  Object.fromEntries(await Promise.all(COLLECTIONS.map(async ({ label, model }) => [label, await (model as mongoose.Model<any>).countDocuments({ institution })])));

const erase = (institution: Types.ObjectId): Promise<Counts> =>
  withOptionalTransaction(async (session: ClientSession | null) => {
    const deleted: Counts = {};
    for (const { label, model } of COLLECTIONS) {
      const result = await (model as mongoose.Model<any>).deleteMany({ institution }, session ? { session } : {});
      deleted[label] = result.deletedCount;
    }
    return deleted;
  });

const print = (counts: Counts) => {
  const width = Math.max(...Object.keys(counts).map((label) => label.length));
  for (const [label, amount] of Object.entries(counts)) console.log(`  ${label.padEnd(width)}  ${amount}`);
};

const run = async () => {
  const uri = getMongoUri();
  const host = assertHostAllowed(uri, readFlag("confirm-host"), "erase Room Allocation data");
  await connectDatabase();
  const institution = await findInstitution(readFlag("institution"));
  console.log(`Institution: ${institution.name}\nDatabase: ${databaseOf(uri)} on ${host}\n`);

  const before = await count(institution._id);
  const total = Object.values(before).reduce((sum, amount) => sum + amount, 0);
  if (!hasFlag("commit")) {
    console.log("DRY RUN. This would delete:");
    print(before);
    console.log(total ? "\nRun again with --commit to delete them." : "\nThere is nothing to delete.");
    return;
  }
  if (!total) {
    console.log("There is nothing to delete.");
    return;
  }

  const deleted = await erase(institution._id);
  console.log("Deleted:");
  print(deleted);
  await AuditLog.create({
    action: "timetabling.reset",
    actorEmail: "script:resetTimetabling",
    targetCollection: "Institution",
    targetId: String(institution._id),
    details: { institutionName: institution.name, database: databaseOf(uri), host, deleted },
  });
};

run()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
