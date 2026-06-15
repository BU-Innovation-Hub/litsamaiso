import { model, Schema } from "mongoose";

export interface InstitutionDocument {
  name: string;
  email: string;
}

const institutionSchema = new Schema<InstitutionDocument>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, unique: true },
  },
  {
    timestamps: true,
  },
);

export const Institution = model<InstitutionDocument>(
  "Institution",
  institutionSchema,
);
export default Institution;