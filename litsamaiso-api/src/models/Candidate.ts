import { model, Schema, type Types } from "mongoose";

export interface CandidateDocument {
  electionId: Types.ObjectId;
  positionId: Types.ObjectId;
  studentId?: string;
  fullName: string;
  party?: string;
  manifesto?: string;
  imageUrl?: string;
  approved: boolean;
  disqualified: boolean;
  voteCountCached: number;
  deletedAt?: Date | null;
  deletedBy?: Types.ObjectId | null;
}

const candidateSchema = new Schema<CandidateDocument>(
  {
    electionId: {
      type: Schema.Types.ObjectId,
      ref: "Election",
      required: true,
    },
    positionId: {
      type: Schema.Types.ObjectId,
      ref: "Position",
      required: true,
    },
    studentId: { type: String, trim: true },
    fullName: { type: String, required: true, trim: true },
    party: { type: String, trim: true },
    manifesto: { type: String, trim: true },
    imageUrl: { type: String, trim: true },
    approved: { type: Boolean, default: false },
    disqualified: { type: Boolean, default: false },
    voteCountCached: { type: Number, default: 0 },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  {
    timestamps: true,
  },
);

candidateSchema.index({ electionId: 1, positionId: 1 });
candidateSchema.index({ electionId: 1, positionId: 1, studentId: 1 }, { unique: true, partialFilterExpression: { deletedAt: null, studentId: { $type: "string" } } });

export const Candidate = model<CandidateDocument>("Candidate", candidateSchema);
export default Candidate;
