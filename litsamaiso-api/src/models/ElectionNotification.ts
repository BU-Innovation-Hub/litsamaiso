import { model, Schema, type Types } from "mongoose";

export type ElectionNotificationKind = "OPENED" | "REMINDER" | "CLOSED" | "RESULTS";
export type ElectionNotificationStatus = "queued" | "processing" | "completed" | "failed" | "skipped";

export interface ElectionNotificationFailure {
  email: string;
  error: string;
}

// One record per election per email. The unique index makes each email go out once even if
// several code paths trigger it, and `processedCount` lets an interrupted send resume.
export interface ElectionNotificationDocument {
  electionId: Types.ObjectId;
  kind: ElectionNotificationKind;
  status: ElectionNotificationStatus;
  totalRecipients: number;
  processedCount: number;
  successfulSends: number;
  failedSends: number;
  failures: ElectionNotificationFailure[];
  skippedReason?: string;
  lastError?: string;
  startedAt?: Date;
  completedAt?: Date;
}

const failureSchema = new Schema<ElectionNotificationFailure>(
  {
    email: { type: String, required: true, trim: true },
    error: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const electionNotificationSchema = new Schema<ElectionNotificationDocument>(
  {
    electionId: { type: Schema.Types.ObjectId, ref: "Election", required: true },
    kind: { type: String, enum: ["OPENED", "REMINDER", "CLOSED", "RESULTS"], required: true },
    status: {
      type: String,
      enum: ["queued", "processing", "completed", "failed", "skipped"],
      default: "queued",
      required: true,
    },
    totalRecipients: { type: Number, default: 0 },
    processedCount: { type: Number, default: 0 },
    successfulSends: { type: Number, default: 0 },
    failedSends: { type: Number, default: 0 },
    failures: { type: [failureSchema], default: [] },
    skippedReason: { type: String, trim: true },
    lastError: { type: String, trim: true },
    startedAt: { type: Date },
    completedAt: { type: Date },
  },
  { timestamps: true },
);

electionNotificationSchema.index({ electionId: 1, kind: 1 }, { unique: true });

export const ElectionNotification = model<ElectionNotificationDocument>(
  "ElectionNotification",
  electionNotificationSchema,
);
export default ElectionNotification;
