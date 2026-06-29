import { model, Schema, type Types } from "mongoose";

export interface FinancialClearanceDocument {
  borrowerNumber: string;
  accountNumber: string;
  bankName: string;
  batchNumber: number;
  courseOfStudy: string;
  fullnames: string;
  graduating: boolean;
  status: "pending" | "confirmed" | "erroneous" | "paid" | "undefined";
  paidDate?: Date;
  paidAt?: Date;
  institution: Types.ObjectId;
  confirmedBy?: Types.ObjectId;
  confirmationDate?: Date;
}

const financialClearanceSchema = new Schema<FinancialClearanceDocument>(
  {
    borrowerNumber: { type: String, required: true, trim: true },
    accountNumber: { type: String, required: true, trim: true },
    bankName: { type: String, required: true, trim: true },
    batchNumber: { type: Number, required: true },
    courseOfStudy: { type: String, required: true, trim: true },
    fullnames: { type: String, required: true, trim: true },
    graduating: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ["pending", "confirmed", "erroneous", "paid", "undefined"],
      default: "pending",
      trim: true,
    },
    paidDate: { type: Date },
    paidAt: { type: Date },
    institution: {
      type: Schema.Types.ObjectId,
      ref: "Institution",
      required: true,
    },
    confirmedBy: { type: Schema.Types.ObjectId, ref: "Student" },
    confirmationDate: { type: Date },
  },
  {
    timestamps: true,
  },
);

financialClearanceSchema.index({ institution: 1, borrowerNumber: 1 }, { unique: true });
financialClearanceSchema.index({ institution: 1, accountNumber: 1 }, { unique: true });

export const FinancialClearance = model<FinancialClearanceDocument>("FinancialClearance", financialClearanceSchema);
export default FinancialClearance;
