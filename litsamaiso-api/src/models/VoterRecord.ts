import { model, Schema, type Types } from "mongoose";

// Records that a student voted in an election. Deliberately holds no reference to the
// anonymous Ballot, so who voted can't be joined to what they voted for.
export interface VoterRecordDocument {
  electionId: Types.ObjectId;
  studentId: string;
  receiptId: string;
  submittedAt: Date;
  idempotencyKey?: string;
  ipAddress?: string;
  userAgent?: string;
}

const voterRecordSchema = new Schema<VoterRecordDocument>(
  {
    electionId: { type: Schema.Types.ObjectId, ref: "Election", required: true },
    studentId: { type: String, required: true, trim: true },
    receiptId: { type: String, required: true, trim: true },
    submittedAt: { type: Date, required: true },
    idempotencyKey: { type: String, trim: true },
    ipAddress: { type: String, trim: true },
    userAgent: { type: String, trim: true },
  },
  {
    timestamps: true,
  },
);

voterRecordSchema.index({ electionId: 1, studentId: 1 }, { unique: true });
voterRecordSchema.index({ receiptId: 1 }, { unique: true });

export const VoterRecord = model<VoterRecordDocument>("VoterRecord", voterRecordSchema);
export default VoterRecord;
