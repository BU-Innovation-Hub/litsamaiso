import { model, Schema } from "mongoose";

export interface InstitutionDocument {
  name: string;
  email: string;
  locked?: boolean;
  lockedReason?: string;
  lockedAt?: Date;
}

const institutionSchema = new Schema<InstitutionDocument>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, unique: true },
    locked: { type: Boolean, default: false },
    lockedReason: { type: String, trim: true },
    lockedAt: { type: Date },
  },
  {
    timestamps: true,
  },
);

export const Institution = model<InstitutionDocument>("Institution", institutionSchema);
export default Institution;