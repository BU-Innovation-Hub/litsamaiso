// Marks institutions created before billing existed as "manual" so they are
// never locked by the subscription lifecycle. Dry run by default.
//
//   npm run backfill:billing -- --apply
import "dotenv/config";
import mongoose from "mongoose";
import { connectDatabase } from "../config/database.js";
import { Institution } from "../models/Institution.js";

const shouldApply = process.argv.includes("--apply");

const run = async () => {
  await connectDatabase();
  const filter = { "billing.status": { $exists: false } };
  const pending = await Institution.find(filter).select("name email").lean();
  console.log(JSON.stringify({ dryRun: !shouldApply, count: pending.length, institutions: pending }, null, 2));

  if (shouldApply && pending.length) {
    const result = await Institution.updateMany(filter, { $set: { billing: { status: "manual" } } });
    console.log(`Updated ${result.modifiedCount} institution(s).`);
  }
  await mongoose.disconnect();
};

run().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exitCode = 1;
});
