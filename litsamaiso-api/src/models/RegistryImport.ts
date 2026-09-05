import { model, Schema, type Types } from "mongoose";

export type RegistryImportKind = "students" | "financial";
export type RegistryClassification =
  | "matched"
  | "possible/review"
  | "missing/unmatched"
  | "conflict"
  | "duplicate";

export interface RegistryImportDocument {
  institution: Types.ObjectId;
  uploadedBy: Types.ObjectId;
  kind: RegistryImportKind;
  filename: string;
  rows: any;
  summary: Record<string, number>;
  status: "staged" | "applied";
  createdAt?: Date;
  updatedAt?: Date;
}

const registryImportSchema = new Schema<RegistryImportDocument>(
  {
    institution: { type: Schema.Types.ObjectId, ref: "Institution", required: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    kind: { type: String, enum: ["students", "financial"], required: true },
    filename: { type: String, required: true, trim: true },
    rows: { type: Schema.Types.Mixed, default: [] },
    summary: { type: Schema.Types.Mixed, default: {} },
    status: { type: String, enum: ["staged", "applied"], default: "staged" },
  },
  { timestamps: true },
);

registryImportSchema.index({ institution: 1, createdAt: -1 });
registryImportSchema.index({ institution: 1, kind: 1, status: 1 });

export const RegistryImport = model<RegistryImportDocument>("RegistryImport", registryImportSchema);
export default RegistryImport;
