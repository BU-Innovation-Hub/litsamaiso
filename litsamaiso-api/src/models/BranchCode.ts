import { model, Schema, type Types } from "mongoose";

export interface BranchCodeDocument {
  bankName: string;
  branchCode: string;
  description?: string;
  institution: Types.ObjectId;
}

const branchCodeSchema = new Schema<BranchCodeDocument>(
  {
    bankName: { type: String, required: true, trim: true },
    branchCode: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    institution: {
      type: Schema.Types.ObjectId,
      ref: "Institution",
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

branchCodeSchema.index({ institution: 1, bankName: 1 }, { unique: true });
branchCodeSchema.index({ bankName: 1 });

export const BranchCode = model<BranchCodeDocument>("BranchCode", branchCodeSchema);
export default BranchCode;
