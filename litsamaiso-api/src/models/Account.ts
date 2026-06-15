import { model, Schema, type Types } from "mongoose";

export interface AccountDocument {
  contractNumber: string;
  accountNumber: string;
  bankName: string;
  batchNumber: number;
  courseOfStudy: string;
  fullnames: string;
  graduating: boolean;
  status: string;
  paidDate?: Date;
  paidAt?: Date;
  institution: Types.ObjectId;
  confirmedBy?: Types.ObjectId;
  confirmationDate?: Date;
}

const accountSchema = new Schema<AccountDocument>(
  {
    contractNumber: { type: String, required: true, trim: true },
    accountNumber: { type: String, required: true, trim: true },
    bankName: { type: String, required: true, trim: true },
    batchNumber: { type: Number, required: true },
    courseOfStudy: { type: String, required: true, trim: true },
    fullnames: { type: String, required: true, trim: true },
    graduating: { type: Boolean, default: false },
    status: { type: String, default: "undefined", trim: true },
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

accountSchema.index({ institution: 1, contractNumber: 1 }, { unique: true });
accountSchema.index({ institution: 1, accountNumber: 1 }, { unique: true });

export const Account = model<AccountDocument>("Account", accountSchema);
export default Account;