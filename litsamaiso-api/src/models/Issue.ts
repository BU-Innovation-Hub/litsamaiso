import { model, Schema } from "mongoose";

export interface IssueDocument {
  contractNumber?: string;
  studentId: string;
  bankName?: string;
  accountNumber?: string;
  reasons: string[];
  correctedBankName?: string;
  correctedAccountNumber?: string;
  documentBase64?: string;
  documentMimeType?: string;
  documentFileName?: string;
}

const issueSchema = new Schema<IssueDocument>(
  {
    contractNumber: { type: String, trim: true },
    studentId: { type: String, required: true, trim: true, unique: true },
    bankName: { type: String, trim: true },
    accountNumber: { type: String, trim: true },
    reasons: { type: [String], default: [] },
    correctedBankName: { type: String, trim: true },
    correctedAccountNumber: { type: String, trim: true },
    documentBase64: { type: String },
    documentMimeType: { type: String, trim: true },
    documentFileName: { type: String, trim: true },
  },
  {
    timestamps: true,
  },
);

export const Issue = model<IssueDocument>("Issue", issueSchema);
export default Issue;