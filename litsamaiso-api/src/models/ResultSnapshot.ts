import { model, Schema, type Types } from "mongoose";

export interface ResultRanking {
  candidateId: Types.ObjectId;
  votes: number;
  percentage: number;
  rank: number;
}

// WINNER: one clear leader. TIE: two or more share the top vote count. NO_VOTES: nobody received a vote.
export type ResultOutcome = "WINNER" | "TIE" | "NO_VOTES";

export interface ResultPositionSnapshot {
  positionId: Types.ObjectId;
  rankings: ResultRanking[];
  winnerId?: Types.ObjectId | null;
  outcome?: ResultOutcome;
}

export interface ResultSnapshotDocument {
  electionId: Types.ObjectId;
  generatedAt: Date;
  positions: ResultPositionSnapshot[];
  snapshotHash: string;
  generatedBy?: Types.ObjectId;
}

const resultRankingSchema = new Schema<ResultRanking>(
  {
    candidateId: { type: Schema.Types.ObjectId, ref: "Candidate", required: true },
    votes: { type: Number, required: true },
    percentage: { type: Number, required: true },
    rank: { type: Number, required: true },
  },
  { _id: false },
);

const resultPositionSchema = new Schema<ResultPositionSnapshot>(
  {
    positionId: { type: Schema.Types.ObjectId, ref: "Position", required: true },
    rankings: { type: [resultRankingSchema], default: [] },
    winnerId: { type: Schema.Types.ObjectId, ref: "Candidate" },
    outcome: { type: String, enum: ["WINNER", "TIE", "NO_VOTES"] },
  },
  { _id: false },
);

const resultSnapshotSchema = new Schema<ResultSnapshotDocument>(
  {
    electionId: { type: Schema.Types.ObjectId, ref: "Election", required: true },
    generatedAt: { type: Date, required: true },
    positions: { type: [resultPositionSchema], default: [] },
    snapshotHash: { type: String, required: true, trim: true },
    generatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  {
    timestamps: true,
  },
);

resultSnapshotSchema.index({ electionId: 1, generatedAt: -1 });

export const ResultSnapshot = model<ResultSnapshotDocument>(
  "ResultSnapshot",
  resultSnapshotSchema,
);
export default ResultSnapshot;
