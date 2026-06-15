import { model, Schema, type Types } from "mongoose";

export type ElectionStatus =
  | "DRAFT"
  | "SCHEDULED"
  | "OPEN"
  | "CLOSED"
  | "COUNTING"
  | "RESULTS_PUBLISHED"
  | "ARCHIVED";

export interface ElectionDocument {
  title: string;
  description?: string;
  academicYear?: string;
  status: ElectionStatus;
  startTime?: Date;
  endTime?: Date;
  timezone?: string;
  createdBy: Types.ObjectId;
  institution: Types.ObjectId;
  published: boolean;
  archived: boolean;
  resultsPublished: boolean;
  votingRules?: Record<string, unknown>;
  securitySettings?: Record<string, unknown>;
  deletedAt?: Date | null;
  deletedBy?: Types.ObjectId | null;
}

const electionSchema = new Schema<ElectionDocument>(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    academicYear: { type: String, trim: true },
    status: {
      type: String,
      required: true,
      enum: [
        "DRAFT",
        "SCHEDULED",
        "OPEN",
        "CLOSED",
        "COUNTING",
        "RESULTS_PUBLISHED",
        "ARCHIVED",
      ],
      default: "DRAFT",
    },
    startTime: { type: Date },
    endTime: { type: Date },
    timezone: { type: String, trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    institution: {
      type: Schema.Types.ObjectId,
      ref: "Institution",
      required: true,
    },
    published: { type: Boolean, default: false },
    archived: { type: Boolean, default: false },
    resultsPublished: { type: Boolean, default: false },
    votingRules: { type: Schema.Types.Mixed, default: {} },
    securitySettings: { type: Schema.Types.Mixed, default: {} },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  {
    timestamps: true,
  },
);

electionSchema.index({ institution: 1, status: 1 });
electionSchema.index({ institution: 1, archived: 1 });
electionSchema.index({ institution: 1, startTime: 1 });
electionSchema.index({ institution: 1, endTime: 1 });

electionSchema.index(
  { institution: 1, title: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);

export const Election = model<ElectionDocument>("Election", electionSchema);
export default Election;
