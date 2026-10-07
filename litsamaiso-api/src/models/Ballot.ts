import { randomUUID } from "crypto";
import { model, Schema, type Types } from "mongoose";

export interface BallotSelection {
  positionId: Types.ObjectId;
  candidateId: Types.ObjectId;
}

// An anonymous ballot: no student, receipt, IP or timestamp, and a random (not time-based)
// id, so it can't be linked back to the VoterRecord written in the same transaction.
export interface BallotDocument {
  _id: string;
  electionId: Types.ObjectId;
  selections: BallotSelection[];
  ballotHash: string;
}

const ballotSelectionSchema = new Schema<BallotSelection>(
  {
    positionId: { type: Schema.Types.ObjectId, ref: "Position", required: true },
    candidateId: { type: Schema.Types.ObjectId, ref: "Candidate", required: true },
  },
  { _id: false },
);

const ballotSchema = new Schema<BallotDocument>(
  {
    _id: { type: String, default: () => randomUUID() },
    electionId: { type: Schema.Types.ObjectId, ref: "Election", required: true },
    selections: { type: [ballotSelectionSchema], required: true },
    ballotHash: { type: String, required: true, trim: true },
  },
  {
    timestamps: false,
    versionKey: false,
  },
);

ballotSchema.index({ electionId: 1 });

// Separate collection from the legacy "ballots", which stored studentId on each ballot.
// Legacy ballots are moved here by `npm run migrate:ballot-secrecy`.
export const Ballot = model<BallotDocument>("Ballot", ballotSchema, "secretballots");
export default Ballot;
