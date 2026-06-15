import { model, Schema, type Types } from "mongoose";

export interface BallotSelection {
  positionId: Types.ObjectId;
  candidateId: Types.ObjectId;
}

export interface BallotDocument {
  electionId: Types.ObjectId;
  studentId: string;
  submittedAt: Date;
  selections: BallotSelection[];
  ipAddress?: string;
  userAgent?: string;
  ballotHash: string;
  receiptId: string;
  idempotencyKey?: string;
  deletedAt?: Date | null;
  deletedBy?: Types.ObjectId | null;
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
    electionId: { type: Schema.Types.ObjectId, ref: "Election", required: true },
    studentId: { type: String, required: true, trim: true },
    submittedAt: { type: Date, required: true },
    selections: { type: [ballotSelectionSchema], required: true },
    ipAddress: { type: String, trim: true },
    userAgent: { type: String, trim: true },
    ballotHash: { type: String, required: true, trim: true },
    receiptId: { type: String, required: true, trim: true },
    idempotencyKey: { type: String, trim: true },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  {
    timestamps: true,
  },
);

ballotSchema.index(
  { electionId: 1, studentId: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
ballotSchema.index({ electionId: 1, submittedAt: -1 });
ballotSchema.index(
  { electionId: 1, studentId: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null, idempotencyKey: { $type: "string" } } },
);

export const Ballot = model<BallotDocument>("Ballot", ballotSchema);
export default Ballot;
