import { model, Schema, type Types } from "mongoose";

// A lecturer Registry timetables. Not a login account; it can be linked to one later.
export interface LecturerDocument {
  institution: Types.ObjectId;
  name: string;
  email: string;
  staffNumber?: string;
}

const lecturerSchema = new Schema<LecturerDocument>(
  {
    institution: { type: Schema.Types.ObjectId, ref: "Institution", required: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    staffNumber: { type: String, trim: true },
  },
  { timestamps: true },
);

lecturerSchema.index({ institution: 1, email: 1 }, { unique: true });

export const Lecturer = model<LecturerDocument>("Lecturer", lecturerSchema);
export default Lecturer;
