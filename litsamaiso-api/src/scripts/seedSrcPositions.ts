import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import { connectDatabase } from "../config/database.js";
import { Election, type ElectionStatus } from "../models/Election.js";
import { ensureDefaultSrcPositions } from "../services/positionService.js";

const EDITABLE_STATUSES: ElectionStatus[] = ["DRAFT", "SCHEDULED"];

const seedSrcPositions = async (): Promise<void> => {
  await connectDatabase();

  const elections = await Election.find({
    deletedAt: null,
    status: { $in: EDITABLE_STATUSES },
  })
    .select("_id title status")
    .sort({ createdAt: -1 });

  if (elections.length === 0) {
    console.log("No draft or scheduled elections found. Nothing to seed.");
    return;
  }

  let totalCreated = 0;

  for (const election of elections) {
    const created = await ensureDefaultSrcPositions({
      electionId: election._id.toString(),
    });
    totalCreated += created.length;
    console.log(
      `${election.title} (${election.status}): ${created.length} SRC position(s) added`,
    );
  }

  console.log(
    `Done. Added ${totalCreated} SRC position(s) across ${elections.length} editable election(s).`,
  );
};

seedSrcPositions()
  .catch((error) => {
    console.error("Failed to seed SRC positions:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
