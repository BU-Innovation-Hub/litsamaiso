import "dotenv/config";
import { randomUUID } from "crypto";
import mongoose from "mongoose";
import { connectDatabase } from "../config/database.js";
import { Ballot } from "../models/Ballot.js";
import { VoterRecord } from "../models/VoterRecord.js";
import { buildBallotHash } from "../utils/ballotHash.js";

// Splits legacy ballots (which stored studentId next to the selections) into a VoterRecord
// (who voted) and an anonymous Ballot (what was voted), then removes the legacy ballot.
// Dry run by default; pass --apply --confirm to write. Safe to re-run.
const shouldApply =
  process.argv.includes("--apply") && process.argv.includes("--confirm");

const shuffle = <T>(items: T[]): T[] => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
};

const migrateBallotSecrecy = async (): Promise<void> => {
  await connectDatabase();
  await Promise.all([Ballot.syncIndexes(), VoterRecord.syncIndexes()]);

  const legacy = mongoose.connection.collection("ballots");
  const electionIds = await legacy.distinct("electionId", { deletedAt: null });
  console.log(
    `${shouldApply ? "Applying" : "Dry run"}: ${electionIds.length} election(s) with legacy ballots`,
  );

  let totalMigrated = 0;

  for (const electionId of electionIds) {
    const legacyBallots = await legacy.find({ electionId, deletedAt: null }).toArray();
    console.log(`Election ${String(electionId)}: ${legacyBallots.length} legacy ballot(s)`);
    if (!shouldApply || legacyBallots.length === 0) continue;

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const existingVoters = await VoterRecord.find({ electionId })
          .select("studentId")
          .session(session)
          .lean();
        const alreadyRecorded = new Set(existingVoters.map((record) => record.studentId));

        const toMigrate = legacyBallots.filter((ballot) => !alreadyRecorded.has(ballot.studentId));

        if (toMigrate.length > 0) {
          await VoterRecord.insertMany(
            toMigrate.map((ballot) => ({
              electionId,
              studentId: ballot.studentId,
              receiptId: ballot.receiptId,
              submittedAt: ballot.submittedAt,
              ...(ballot.idempotencyKey && { idempotencyKey: ballot.idempotencyKey }),
              ...(ballot.ipAddress && { ipAddress: ballot.ipAddress }),
              ...(ballot.userAgent && { userAgent: ballot.userAgent }),
            })),
            { session },
          );

          // Shuffle so the anonymous ballots' insertion order doesn't mirror the voters'
          await Ballot.insertMany(
            shuffle(toMigrate).map((ballot) => {
              const ballotId = randomUUID();
              const selections = (ballot.selections || []).map((s: any) => ({
                positionId: s.positionId,
                candidateId: s.candidateId,
              }));
              return {
                _id: ballotId,
                electionId,
                selections,
                ballotHash: buildBallotHash({
                  electionId: String(electionId),
                  ballotId,
                  selections: selections.map((s: any) => ({
                    positionId: String(s.positionId),
                    candidateId: String(s.candidateId),
                  })),
                }).hash,
              };
            }),
            { session },
          );
        }

        await legacy.deleteMany(
          { _id: { $in: legacyBallots.map((ballot) => ballot._id) } },
          { session },
        );
        totalMigrated += toMigrate.length;
      });
    } finally {
      await session.endSession();
    }
  }

  if (shouldApply) {
    const remaining = await legacy.countDocuments({});
    console.log(`Done. Migrated ${totalMigrated} ballot(s). ${remaining} document(s) left in legacy "ballots".`);
  } else {
    console.log("No changes written. Re-run with --apply --confirm to migrate.");
  }
};

migrateBallotSecrecy()
  .catch((error) => {
    console.error("Failed to migrate ballots:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
