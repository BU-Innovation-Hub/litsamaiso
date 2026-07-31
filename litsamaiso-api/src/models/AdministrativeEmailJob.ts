import { model, Schema, type Types } from "mongoose";

export type AdministrativeEmailJobStatus =
  | "queued"
  | "processing"
  | "completed"
  | "failed";

export interface AdministrativeEmailFailure {
  email: string;
  error: string;
}

export interface AdministrativeEmailJobDocument {
  status: AdministrativeEmailJobStatus;
  recipientSelection: {
    role: string;
    financialStatus?: "pending" | "confirmed" | "paid" | undefined;
    batchNumber?: number | undefined;
  };
  subject: string;
  body: string;
  totalRecipients: number;
  successfulSends: number;
  failedSends: number;
  failures: AdministrativeEmailFailure[];
  requestedBy: Types.ObjectId;
  startedAt?: Date | undefined;
  completedAt?: Date | undefined;
  lastError?: string | undefined;
}

const administrativeEmailFailureSchema = new Schema<AdministrativeEmailFailure>(
  {
    email: { type: String, required: true, trim: true },
    error: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const administrativeEmailJobSchema =
  new Schema<AdministrativeEmailJobDocument>(
    {
      status: {
        type: String,
        enum: ["queued", "processing", "completed", "failed"],
        default: "queued",
        required: true,
      },
      recipientSelection: {
        role: { type: String, required: true, trim: true },
        financialStatus: {
          type: String,
          enum: ["pending", "confirmed", "paid"],
          required: false,
        },
        batchNumber: { type: Number, required: false },
      },
      subject: { type: String, required: true, trim: true },
      body: { type: String, required: true, trim: true },
      totalRecipients: { type: Number, required: true, default: 0 },
      successfulSends: { type: Number, required: true, default: 0 },
      failedSends: { type: Number, required: true, default: 0 },
      failures: { type: [administrativeEmailFailureSchema], default: [] },
      requestedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
      startedAt: { type: Date },
      completedAt: { type: Date },
      lastError: { type: String, trim: true },
    },
    {
      timestamps: true,
    },
  );

administrativeEmailJobSchema.index({ requestedBy: 1, createdAt: -1 });

export const AdministrativeEmailJob = model<AdministrativeEmailJobDocument>(
  "AdministrativeEmailJob",
  administrativeEmailJobSchema,
);

export default AdministrativeEmailJob;
