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
  proofUrls?: string[];
  notes?: string;
  status?: string;
  approvedBy?: any;
  approvedAt?: Date;
  rejectedBy?: any;
  rejectedAt?: Date;
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
    proofUrls: { type: [String], default: [] },
    notes: { type: String, trim: true },
    attempts: { type: Number, default: 0 },
    status: { type: String, trim: true, default: 'submitted' },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    approvedAt: { type: Date },
    rejectedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    rejectedAt: { type: Date },
  },
  {
    timestamps: true,
  },
);

export const Issue = model<IssueDocument>("Issue", issueSchema);
export default Issue;