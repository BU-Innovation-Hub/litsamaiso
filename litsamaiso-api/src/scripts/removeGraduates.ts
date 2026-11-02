// Removes the students on the registry's graduates list, so they can no longer sign in or register.
//
// Removed: the Student record, the login, their Issue and Feedback, and their profile photos in Cloudinary.
// Kept: VoterRecord and Candidate (they stop double voting and hold up election results), FinancialClearance
// and RegistryFinancialClearance (payment history), and AuditLog (the history of what happened).
//
// An ID on the list isn't enough. Someone is only removed when their record also agrees on email or surname and
// nothing else needs a person to look at it. The rest are held back and listed in the report with the reason.
//
// Only reports what it would do until --commit is passed. A real run also needs --expect=<count> from the dry run,
// so it removes what was reviewed or nothing, and --backup=<new.json> to save the records first.
//
// The database comes from GRADUATES_MONGO_URI and never from MONGO_URI, so whatever .env points at can't be
// written to by accident. Writing anywhere but this machine also needs --confirm-host=<host>.
//
// The report and backup hold personal data, and the backup holds password hashes, so both must be outside the repo.
//
//   $env:GRADUATES_MONGO_URI="mongodb+srv://..."
//   npx tsx src/scripts/removeGraduates.ts --file "C:\path\graduates.xlsx" --institution "Botho University Lesotho" --out "C:\path\report.xlsx"
//   npx tsx src/scripts/removeGraduates.ts --file "C:\path\graduates.xlsx" --institution "Botho University Lesotho" --out "C:\path\report.xlsx" --commit --expect=<count> --backup "C:\path\backup.json" --confirm-host=<host>
import dotenv from "dotenv";
dotenv.config();

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { v2 as cloudinary } from "cloudinary";
import mongoose from "mongoose";
import XLSX from "xlsx";
import { AdministrativeEmailJob } from "../models/AdministrativeEmailJob.js";
import { AuditLog } from "../models/AuditLog.js";
import { Candidate } from "../models/Candidate.js";
import { Election, type ElectionStatus } from "../models/Election.js";
import { Feedback } from "../models/Feedback.js";
import { FinancialClearance } from "../models/FinancialClearance.js";
import { Institution } from "../models/Institution.js";
import { Issue } from "../models/Issue.js";
import { Position } from "../models/Position.js";
import { RegistryFinancialClearance } from "../models/RegistryFinancialClearance.js";
import { RegistryImport } from "../models/RegistryImport.js";
import { ResultSnapshot } from "../models/ResultSnapshot.js";
import "../models/Role.js";
import { Student } from "../models/Student.js";
import { User } from "../models/User.js";
import { VoterRecord } from "../models/VoterRecord.js";

// Student IDs start with the two digit year of entry, so anyone newer than this is unlikely to have finished yet.
// They're held back unless named in --allow-recent.
const NEWEST_GRADUATE_ID_YEAR = 22;
const OLD_ID_PREFIXES = ["19", "20", "21"];
// Results aren't final until they're published, so a candidate in one of these is still in a running election
const SETTLED_ELECTION_STATUSES: ElectionStatus[] = ["RESULTS_PUBLISHED", "ARCHIVED"];
const CASE_INSENSITIVE = { locale: "en", strength: 2 } as const;
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

type Graduate = { row: number; studentId: string; surname: string; firstName: string; email: string };

const readFlag = (name: string): string | undefined => {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  const next = index >= 0 ? process.argv[index + 1] : undefined;
  return next && !next.startsWith("--") ? next : undefined;
};

const commit = process.argv.includes("--commit");

function fail(message: string): never {
  throw new Error(message);
}

const hostOf = (uri: string): string => {
  const match = /^mongodb(?:\+srv)?:\/\/(?:[^@/]*@)?([^/?]+)/.exec(uri);
  return match?.[1] ?? fail("GRADUATES_MONGO_URI isn't a MongoDB connection string");
};

const isLocalHost = (host: string): boolean => /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host);

const outsideRepo = (file: string, flag: string): string => {
  const resolved = path.resolve(file);
  const relative = path.relative(REPO_ROOT, resolved);
  if (!relative.startsWith("..") && !path.isAbsolute(relative)) fail(`--${flag} holds personal data, so it must be outside the repo`);
  return resolved;
};

// Prints where it's connected, and never the credentials
const connect = async (): Promise<void> => {
  const uri = process.env.GRADUATES_MONGO_URI?.trim();
  if (!uri) fail("Set GRADUATES_MONGO_URI to the database to use. MONGO_URI is deliberately ignored.");

  const host = hostOf(uri);
  if (commit && !isLocalHost(host) && readFlag("confirm-host") !== host) {
    fail(`This deletes from a remote database. To go ahead, add --confirm-host=${host}`);
  }

  // autoIndex off: this script has no business building indexes on a live database
  await mongoose.connect(uri, { autoIndex: false, serverSelectionTimeoutMS: 15000 });
  const dbName = mongoose.connection.db?.databaseName;
  // A URI with no database name silently means "test", which would look like nobody matched
  if (!dbName || dbName === "test") fail("GRADUATES_MONGO_URI must name the app's database, as in .../litsamaiso_db");
  console.log(`Database: ${dbName} on ${host}`);
  console.log(commit ? "Mode: COMMIT, records will be deleted\n" : "Mode: dry run, nothing will be deleted\n");
};

const clean = (value: unknown) => String(value ?? "").trim();
const lettersOnly = (value: unknown) => clean(value).normalize("NFD").replace(/[^\p{L}]/gu, "").toLowerCase();

const readGraduates = (file: string): Graduate[] => {
  // Read into memory first: XLSX.readFile has no file access when loaded as an ES module
  const book = XLSX.read(readFileSync(file));
  const sheetName = book.SheetNames[0] ?? fail("The workbook has no sheets");
  const rows = XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[sheetName] as XLSX.WorkSheet, {
    header: 1,
    defval: "",
    blankrows: false,
  });
  const headers = (rows[0] ?? []).map((cell) => clean(cell).toLowerCase());
  const column = (name: string) => {
    const index = headers.indexOf(name);
    return index >= 0 ? index : fail(`The sheet has no "${name}" column`);
  };
  const [surname, firstName, studentId, email] = [column("f_surname"), column("f_firstname"), column("f_stud_num"), column("f_stud_email")];

  return rows.slice(1).map((row, index) => ({
    row: index + 2,
    studentId: clean(row[studentId]),
    surname: clean(row[surname]),
    firstName: clean(row[firstName]),
    email: clean(row[email]).toLowerCase(),
  }));
};

// Only photos in the app's profile folder, so nothing else in the account can be deleted by this
const profilePhotoId = (url: unknown): string | null => {
  if (typeof url !== "string") return null;
  const match = /^https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/(?:v\d+\/)?(profile-photos\/[^.]+)\.[a-z0-9]+$/i.exec(url);
  return match?.[1] ?? null;
};

const countBy = (values: string[]) => {
  const counts = new Map<string, number>();
  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
};

const run = async (): Promise<void> => {
  const file = readFlag("file") ?? fail("Pass the graduates sheet with --file");
  const institutionName = readFlag("institution") ?? fail("Pass the institution the list is from with --institution");
  const out = outsideRepo(readFlag("out") ?? fail("Pass the report to write with --out"), "out");
  if (path.extname(out).toLowerCase() !== ".xlsx") fail("--out must be an .xlsx file");
  const allowRecent = new Set((readFlag("allow-recent") ?? "").split(",").map(clean).filter(Boolean));

  const backup = commit ? outsideRepo(readFlag("backup") ?? fail("A real run needs --backup=<new.json>"), "backup") : undefined;
  if (backup && existsSync(backup)) fail("--backup must be a new file");
  const expected = commit ? Number(readFlag("expect") ?? fail("A real run needs --expect=<count> from the dry run")) : undefined;

  const graduates = readGraduates(file);
  const listedIds = graduates.map((graduate) => graduate.studentId).filter(Boolean);
  if (new Set(listedIds).size !== listedIds.length) fail("The sheet lists a student ID more than once. Fix the sheet first.");
  console.log(`Sheet: ${graduates.length} rows, ${listedIds.length} with a student ID`);

  await connect();

  const institution = await Institution.findOne({ name: institutionName }).select("name").lean();
  if (!institution) fail(`There's no institution named "${institutionName}" in this database`);

  const listedEmails = graduates.map((graduate) => graduate.email).filter(Boolean);
  const students: any[] = await Student.find({ $or: [{ studentId: { $in: listedIds } }, { email: { $in: listedEmails } }] })
    .collation(CASE_INSENSITIVE)
    .select("studentId name surname email institution borrowerNumber")
    .lean();
  const knownEmails = [...new Set([...listedEmails, ...students.map((student) => clean(student.email).toLowerCase())])];
  const users: any[] = await User.find({ $or: [{ studentId: { $in: listedIds } }, { email: { $in: knownEmails } }] })
    .collation(CASE_INSENSITIVE)
    .select("studentId name email institution role additionalRoles borrowerNumber faceImageUrl studentCardUrl")
    .populate("role", "name")
    .lean();

  const sameEmail = (record: { email?: unknown }, email: string) => Boolean(email) && clean(record.email).toLowerCase() === email;

  // A login that other records point at can't go without leaving those records broken
  const userIds = users.map((user) => user._id);
  const referencing = await Promise.all([
    Election.distinct("createdBy", { createdBy: { $in: userIds } }),
    Election.distinct("deletedBy", { deletedBy: { $in: userIds } }),
    Position.distinct("deletedBy", { deletedBy: { $in: userIds } }),
    Candidate.distinct("deletedBy", { deletedBy: { $in: userIds } }),
    RegistryImport.distinct("uploadedBy", { uploadedBy: { $in: userIds } }),
    AdministrativeEmailJob.distinct("requestedBy", { requestedBy: { $in: userIds } }),
    ResultSnapshot.distinct("generatedBy", { generatedBy: { $in: userIds } }),
    Issue.distinct("approvedBy", { approvedBy: { $in: userIds } }),
    Issue.distinct("rejectedBy", { rejectedBy: { $in: userIds } }),
  ]);
  const referencedUsers = new Set(referencing.flat().map(String));

  const candidacies: any[] = await Candidate.find({ studentId: { $in: listedIds }, deletedAt: null }).select("studentId electionId").lean();
  const unsettledElections = new Set(
    (
      await Election.find({
        _id: { $in: candidacies.map((candidate) => candidate.electionId) },
        deletedAt: null,
        status: { $nin: SETTLED_ELECTION_STATUSES },
      })
        .select("_id")
        .lean()
    ).map((election) => String(election._id)),
  );
  const inRunningElection = new Set(
    candidacies.filter((candidate) => unsettledElections.has(String(candidate.electionId))).map((candidate) => candidate.studentId),
  );

  const remove: any[] = [];
  const held: any[] = [];
  const absent: any[] = [];

  for (const graduate of graduates) {
    const student =
      students.find((record) => graduate.studentId && record.studentId === graduate.studentId) ??
      students.find((record) => sameEmail(record, graduate.email));
    const studentEmail = clean(student?.email).toLowerCase();
    const matchingUsers = users.filter(
      (record) =>
        (graduate.studentId && record.studentId === graduate.studentId) ||
        sameEmail(record, graduate.email) ||
        sameEmail(record, studentEmail),
    );
    const user = matchingUsers[0];

    const person = {
      Row: graduate.row,
      "Student ID": graduate.studentId,
      Surname: graduate.surname,
      "First name": graduate.firstName,
      "List email": graduate.email,
      "Student record": student ? `${clean(student.name)} ${clean(student.surname)}`.trim() : "",
      "Student email": clean(student?.email),
      Login: user ? clean(user.email) : "",
    };

    if (!student && !user) {
      absent.push(person);
      continue;
    }

    const reasons: string[] = [];
    if (!graduate.studentId) reasons.push("no student ID on the list, only matched by email");
    if (student && graduate.studentId && student.studentId !== graduate.studentId) reasons.push("email belongs to a Student with a different ID");
    if (matchingUsers.length > 1) reasons.push("more than one login matches");
    if (user && graduate.studentId && user.studentId && user.studentId !== graduate.studentId) reasons.push("email belongs to a login with a different ID");
    if (user && student && user.studentId && user.studentId !== student.studentId) reasons.push("login and Student have different IDs");

    const surname = lettersOnly(graduate.surname);
    const agrees =
      sameEmail({ email: student?.email }, graduate.email) ||
      sameEmail({ email: user?.email }, graduate.email) ||
      (Boolean(surname) && (lettersOnly(student?.surname) === surname || lettersOnly(user?.name).includes(surname)));
    if (!agrees) reasons.push("ID matches, but neither email nor surname does");

    if ([student, user].some((record) => record && String(record.institution) !== String(institution._id))) reasons.push("record is in another institution");
    const roleName = clean(user?.role?.name).toLowerCase();
    if (user && roleName !== "student") reasons.push(`login has the ${clean(user?.role?.name) || "unknown"} role`);
    if (user?.additionalRoles?.length) reasons.push("login also holds another role, such as IEC");
    if (user && referencedUsers.has(String(user._id))) reasons.push("login is referenced by elections, imports or other records");
    if (inRunningElection.has(graduate.studentId)) reasons.push("candidate in an election whose results aren't published");
    const idYear = Number(graduate.studentId.slice(0, 2));
    if (idYear > NEWEST_GRADUATE_ID_YEAR && !allowRecent.has(graduate.studentId)) reasons.push("ID looks too recent to have graduated");

    if (reasons.length > 0) held.push({ ...person, Reason: reasons.join("; "), reasons });
    else remove.push({ ...person, student, user, graduate });
  }

  const removeStudentIds = remove.flatMap(({ student }) => (student ? [student._id] : []));
  const removeUserIds = remove.flatMap(({ user }) => (user ? [user._id] : []));
  const removeIds = remove.map(({ graduate }) => graduate.studentId as string);

  // What stays behind for the people being removed, so a real run holds no surprises
  const borrowerNumbers = [
    ...new Set(remove.flatMap(({ student, user }) => [student?.borrowerNumber, user?.borrowerNumber]).map(clean).filter(Boolean)),
  ];
  const [clearances, registryClearances, voterRecords, candidateRows, issues, feedback, history] = await Promise.all([
    FinancialClearance.find({
      institution: institution._id,
      $or: [{ borrowerNumber: { $in: borrowerNumbers } }, { confirmedBy: { $in: removeStudentIds } }],
    })
      .select("borrowerNumber confirmedBy status")
      .lean(),
    RegistryFinancialClearance.countDocuments({ student: { $in: removeStudentIds } }),
    VoterRecord.countDocuments({ studentId: { $in: removeIds } }),
    Candidate.countDocuments({ studentId: { $in: removeIds } }),
    Issue.find({ studentId: { $in: removeIds } }).select("proofUrls").lean(),
    Feedback.countDocuments({ user: { $in: removeUserIds } }),
    AuditLog.find({ action: "profile.face.enroll", targetId: { $in: removeUserIds.map(String) } }).select("details").lean(),
  ]);

  const clearanceFor = ({ student, user }: any) =>
    clearances
      .filter(
        (clearance) =>
          [clean(student?.borrowerNumber), clean(user?.borrowerNumber)].includes(clean(clearance.borrowerNumber)) ||
          (student && String(clearance.confirmedBy) === String(student._id)),
      )
      .map((clearance) => clean(clearance.status))
      .join(", ");

  const photoUrls = [
    ...remove.flatMap(({ user }) => [user?.faceImageUrl, user?.studentCardUrl]),
    ...history.map((entry) => (entry.details as { photoUrl?: unknown } | undefined)?.photoUrl),
  ].filter(Boolean);
  const photoIds = new Set(photoUrls.flatMap((url) => profilePhotoId(url) ?? []));
  const unrecognizedPhotos = new Set(photoUrls.filter((url) => !profilePhotoId(url))).size;
  const issueProofs = issues.reduce((total, issue) => total + (issue.proofUrls?.length ?? 0), 0);

  const oldIdsNotListed: any[] = await Student.find({
    studentId: { $regex: `^(${OLD_ID_PREFIXES.join("|")})`, $nin: listedIds },
  })
    .select("studentId name surname email studentStatus")
    .sort({ studentId: 1 })
    .lean();
  const oldIdsInSystem = await Student.countDocuments({ studentId: { $regex: `^(${OLD_ID_PREFIXES.join("|")})` } });

  const rows = {
    "Will remove": remove.map(({ student, user, graduate, ...person }) => ({
      ...person,
      "Has Student record": student ? "Yes" : "No",
      "Has login": user ? "Yes" : "No",
      "Clearance status (kept)": clearanceFor({ student, user }),
    })),
    "Held back": held.map(({ reasons, ...person }) => person),
    "On list, not in system": absent,
    "Old IDs not on list": oldIdsNotListed.map((student) => ({
      "Student ID": student.studentId,
      Name: student.name,
      Surname: student.surname,
      Email: student.email,
      Status: student.studentStatus ? "Active" : "Inactive",
    })),
  };

  // Written before anything is deleted, so a report that can't be saved stops the run
  const book = XLSX.utils.book_new();
  Object.entries(rows).forEach(([name, sheetRows]) => XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(sheetRows), name));
  writeFileSync(out, XLSX.write(book, { type: "buffer", bookType: "xlsx" }));

  console.log(`${commit ? "Removing" : "Would remove"}: ${remove.length} people`);
  console.log(`  Student records: ${removeStudentIds.length}`);
  console.log(`  logins: ${removeUserIds.length}`);
  console.log(`  issues: ${issues.length}`);
  console.log(`  feedback: ${feedback}`);
  console.log(`  Cloudinary photos: ${photoIds.size} (${unrecognizedPhotos} URLs not recognized, left alone)`);
  console.log(`Held back: ${held.length}`);
  countBy(held.flatMap(({ reasons }) => reasons as string[])).forEach(([reason, count]) => console.log(`  ${count}: ${reason}`));
  console.log(`On the list, not in the system: ${absent.length}`);
  console.log(`\nKept for the people being removed:`);
  console.log(`  voter records: ${voterRecords}`);
  console.log(`  candidate rows: ${candidateRows}`);
  console.log(`  registry clearances: ${registryClearances}`);
  console.log(`  issue proof URLs, left in storage: ${issueProofs}`);
  console.log(`  clearances: ${clearances.length}`);
  countBy(clearances.map((clearance) => clean(clearance.status))).forEach(([status, count]) => console.log(`    ${count}: ${status}`));
  console.log(`\nStudents with old IDs (${OLD_ID_PREFIXES.join(", ")}): ${oldIdsInSystem}`);
  console.log(`  of those, not on the list and left alone: ${oldIdsNotListed.length}`);
  console.log(`\nReport: ${out}`);

  if (!commit || !backup) {
    console.log(`\nNothing was deleted. For a real run, add --commit --expect=${remove.length} --backup=<new.json>`);
    return;
  }

  if (expected !== remove.length) fail(`--expect=${expected}, but ${remove.length} people match now. Nothing was deleted. Review a new dry run.`);

  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
  if (photoIds.size > 0 && (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET)) {
    fail("Cloudinary isn't configured, so these photos couldn't be deleted. Nothing was deleted.");
  }

  // Straight from the collections, because the models hide fields such as the password hash
  const [studentDocs, userDocs, issueDocs, feedbackDocs] = await Promise.all([
    Student.collection.find({ _id: { $in: removeStudentIds } }).toArray(),
    User.collection.find({ _id: { $in: removeUserIds } }).toArray(),
    Issue.collection.find({ studentId: { $in: removeIds } }).toArray(),
    Feedback.collection.find({ user: { $in: removeUserIds } }).toArray(),
  ]);
  writeFileSync(
    backup,
    mongoose.mongo.BSON.EJSON.stringify({ students: studentDocs, users: userDocs, issues: issueDocs, feedback: feedbackDocs }, { relaxed: false }),
    { flag: "wx" },
  );
  console.log(`\nBackup: ${backup}`);

  // The login goes first, which ends their access. If this stops partway, running it again picks up the rest.
  let removed = 0;
  const failures: string[] = [];
  for (const { student, user, graduate } of remove) {
    try {
      await Issue.deleteMany({ studentId: graduate.studentId });
      if (user) {
        await Feedback.deleteMany({ user: user._id });
        await User.deleteOne({ _id: user._id });
      }
      if (student) await Student.deleteOne({ _id: student._id });
      removed += 1;
    } catch (error) {
      failures.push(`${graduate.studentId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  let photosDeleted = 0;
  const photoFailures: string[] = [];
  if (photoIds.size > 0) {
    cloudinary.config({
      cloud_name: CLOUDINARY_CLOUD_NAME as string,
      api_key: CLOUDINARY_API_KEY as string,
      api_secret: CLOUDINARY_API_SECRET as string,
    });
    for (const id of photoIds) {
      try {
        const { result } = await cloudinary.uploader.destroy(id, { resource_type: "image", invalidate: true });
        // "not found" means it's already gone, which is what this is for
        if (result === "ok" || result === "not found") photosDeleted += 1;
        else photoFailures.push(`${id}: ${result}`);
      } catch (error) {
        photoFailures.push(`${id}: ${error instanceof Error ? error.message : JSON.stringify(error)}`);
      }
    }
  }

  await AuditLog.create({
    action: "registry.graduates.removed",
    targetCollection: "Student",
    details: {
      source: path.basename(file),
      institution: String(institution._id),
      removed,
      failed: failures.length,
      photosDeleted,
      studentIds: removeIds,
    },
  });

  const [studentsLeft, usersLeft] = await Promise.all([
    Student.countDocuments({ _id: { $in: removeStudentIds } }),
    User.countDocuments({ _id: { $in: removeUserIds } }),
  ]);
  console.log(`Removed: ${removed} people. Still there afterwards: ${studentsLeft} Student records, ${usersLeft} logins`);
  console.log(`Photos deleted: ${photosDeleted}`);
  [...failures, ...photoFailures].forEach((line) => console.log(`  failed ${line}`));
  if (failures.length > 0 || photoFailures.length > 0 || studentsLeft > 0 || usersLeft > 0) process.exitCode = 1;
};

run()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
