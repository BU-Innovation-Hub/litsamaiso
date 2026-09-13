import "dotenv/config";
import mongoose from "mongoose";
import { connectDatabase } from "../config/database.js";
import { AuditLog } from "../models/AuditLog.js";
import { Student } from "../models/Student.js";
import { FinancialClearance } from "../models/FinancialClearance.js";
import { RegistryFinancialClearance } from "../models/RegistryFinancialClearance.js";
import { RegistryImport } from "../models/RegistryImport.js";

const shouldApply =
  process.argv.includes("--apply") && process.argv.includes("--confirm");

const renameTopLevelField = async (collectionName: string) => {
  const collection = mongoose.connection.collection(collectionName);
  const matching = await collection.countDocuments({
    personalId: { $exists: true },
  });
  let renamed = 0;
  let emptiesCleared = 0;
  if (shouldApply && matching > 0) {
    // Driver-level update: bypasses Mongoose strict-mode path stripping so $rename is honored.
    const result = await collection.updateMany(
      { personalId: { $exists: true } },
      [{ $set: { nationalId: "$personalId" } }, { $unset: "personalId" }],
    );
    renamed = Number(result.modifiedCount || 0);
    // Empty markers carry no information and would violate the sparse unique index (explicit null IS indexed).
    const cleared = await collection.updateMany(
      { nationalId: { $in: [null, ""] } },
      { $unset: { nationalId: 1 } },
    );
    emptiesCleared = Number(cleared.modifiedCount || 0);
  }
  return { collection: collectionName, matching, renamed, emptiesCleared };
};

const migrateImportRows = async () => {
  const imports: any[] = await (RegistryImport as any)
    .find({ "rows.personalId": { $exists: true } })
    .select("_id rows")
    .lean();
  let rowsRenamed = 0;
  if (shouldApply && imports.length > 0) {
    const ops = imports.map((doc) => {
      const rows = (Array.isArray(doc.rows) ? doc.rows : []).map((row: any) => {
        if (row && typeof row === "object" && "personalId" in row) {
          rowsRenamed += 1;
          const { personalId, ...rest } = row;
          return { ...rest, nationalId: personalId };
        }
        return row;
      });
      return {
        updateOne: {
          filter: { _id: doc._id },
          update: { $set: { rows } },
        },
      };
    });
    if (ops.length > 0) await (RegistryImport as any).bulkWrite(ops);
  } else {
    for (const doc of imports) {
      for (const row of doc.rows || []) {
        if (row && typeof row === "object" && "personalId" in row)
          rowsRenamed += 1;
      }
    }
  }
  return { imports: imports.length, rowsRenamed };
};

const fixStudentIndexes = async () => {
  const collection = mongoose.connection.collection("students");
  const indexes: any[] = await collection.indexes();
  const duplicateGroups = [
    ...(await collection
      .aggregate([
        { $match: { institution: { $exists: true }, nationalId: { $gt: "" } } },
        {
          $group: {
            _id: { institution: "$institution", nationalId: "$nationalId" },
            count: { $sum: 1 },
          },
        },
        { $match: { count: { $gt: 1 } } },
        { $limit: 20 },
      ])
      .toArray()),
    ...(await collection
      .aggregate([
        {
          $match: {
            institution: { $exists: true },
            borrowerNumber: { $gt: "" },
          },
        },
        {
          $group: {
            _id: {
              institution: "$institution",
              borrowerNumber: "$borrowerNumber",
            },
            count: { $sum: 1 },
          },
        },
        { $match: { count: { $gt: 1 } } },
        { $limit: 20 },
      ])
      .toArray()),
  ];
  const emptyNationalQuery = {
    $or: [{ nationalId: { $type: "null" } }, { nationalId: "" }],
  };
  const emptyBorrowerQuery = {
    $or: [{ borrowerNumber: { $type: "null" } }, { borrowerNumber: "" }],
  };
  const emptyNationalIds = await collection.countDocuments(emptyNationalQuery);
  const emptyBorrowerNumbers =
    await collection.countDocuments(emptyBorrowerQuery);
  if (!shouldApply) {
    return {
      dropped: false,
      created: false,
      borrowerIndex: "skipped",
      duplicateGroups: duplicateGroups.length,
      emptyNationalIds,
      emptyBorrowerNumbers,
    };
  }
  if (duplicateGroups.length > 0) {
    throw new Error(
      `Cannot safely rebuild Student indexes: ${duplicateGroups.length} duplicate optional identifier groups detected`,
    );
  }
  let dropped = false;
  for (const name of [
    "institution_1_personalId_1",
    "institution_1_nationalId_1",
    "institution_1_borrowerNumber_1",
  ]) {
    if (indexes.some((index) => index.name === name)) {
      await collection.dropIndex(name);
      dropped = true;
    }
  }
  if (emptyNationalIds > 0) {
    await collection.updateMany(emptyNationalQuery, {
      $unset: { nationalId: 1 },
    });
  }
  if (emptyBorrowerNumbers > 0) {
    await collection.updateMany(emptyBorrowerQuery, {
      $unset: { borrowerNumber: 1 },
    });
  }
  await collection.createIndex(
    { institution: 1, nationalId: 1 },
    {
      unique: true,
      partialFilterExpression: { nationalId: { $type: "string", $gt: "" } },
    },
  );
  await collection.createIndex(
    { institution: 1, borrowerNumber: 1 },
    {
      unique: true,
      partialFilterExpression: { borrowerNumber: { $type: "string", $gt: "" } },
    },
  );
  return {
    dropped,
    created: true,
    borrowerIndex: "ensured",
    duplicateGroups: 0,
    emptyNationalIds,
    emptyBorrowerNumbers,
  };
};

const run = async () => {
  await connectDatabase();
  // Reference models so their collections are registered; all writes go through the driver.
  void Student;
  void FinancialClearance;
  void RegistryFinancialClearance;
  const collections = [
    await renameTopLevelField("students"),
    await renameTopLevelField("financialclearances"),
    await renameTopLevelField("registryfinancialclearances"),
  ];
  const importRows = await migrateImportRows();
  const index = await fixStudentIndexes();

  const report = { dryRun: !shouldApply, collections, importRows, index };
  console.log(JSON.stringify(report, null, 2));

  if (shouldApply) {
    await AuditLog.create({
      action: "registry.national_id_migration",
      targetCollection: "Student",
      details: report,
    });
  }
  await mongoose.disconnect();
};

run().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exitCode = 1;
});
