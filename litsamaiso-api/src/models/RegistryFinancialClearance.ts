import { model, Schema, type Types } from "mongoose";

export interface RegistryFinancialClearanceDocument {
  nationalId: string;
  borrowerNumber: string;
  accountNumber: string;
  bankName: string;
  batchNumber: number;
  courseOfStudy: string;
  fullnames: string;
  graduating: boolean;
  status: "pending" | "confirmed" | "erroneous" | "paid" | "undefined";
  institution: Types.ObjectId;
  student: Types.ObjectId;
  registryImport: Types.ObjectId;
  rowNumber: number;
}

const schema = new Schema<RegistryFinancialClearanceDocument>({
  nationalId: { type: String, required: true, trim: true },
  borrowerNumber: { type: String, required: true, trim: true },
  accountNumber: { type: String, required: true, trim: true },
  bankName: { type: String, required: true, trim: true },
  batchNumber: { type: Number, required: true },
  courseOfStudy: { type: String, required: true, trim: true },
  fullnames: { type: String, required: true, trim: true },
  graduating: { type: Boolean, default: false },
  status: { type: String, enum: ["pending", "confirmed", "erroneous", "paid", "undefined"], default: "pending" },
  institution: { type: Schema.Types.ObjectId, ref: "Institution", required: true },
  student: { type: Schema.Types.ObjectId, ref: "Student", required: true },
  registryImport: { type: Schema.Types.ObjectId, ref: "RegistryImport", required: true },
  rowNumber: { type: Number, required: true },
}, { timestamps: true });

schema.index({ institution: 1, borrowerNumber: 1 }, { unique: true });
schema.index({ institution: 1, accountNumber: 1 }, { unique: true });
schema.index({ registryImport: 1, rowNumber: 1 }, { unique: true });

export const RegistryFinancialClearance = model<RegistryFinancialClearanceDocument>("RegistryFinancialClearance", schema);
export default RegistryFinancialClearance;
