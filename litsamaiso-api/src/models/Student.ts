import { model, Schema, type Types } from "mongoose";

export interface StudentDocument {
  studentId: string;
  email: string;
  name: string;
  surname: string;
  studentStatus: boolean;
  institution: Types.ObjectId;
  borrowerNumber?: string;
  confirmationAttempts?: number;
}

const studentSchema = new Schema<StudentDocument>(
  {
    studentId: { type: String, required: true, trim: true, unique: true },
    email: { type: String, required: true, trim: true, unique: true },
    name: { type: String, required: true, trim: true },
    surname: { type: String, required: true, trim: true },
    studentStatus: { type: Boolean, default: false },
    institution: {
      type: Schema.Types.ObjectId,
      ref: "Institution",
      required: true,
    },
    borrowerNumber: { type: String, trim: true },
    confirmationAttempts: { type: Number, default: 0 },
  },
  {
    timestamps: true,
  },
);

export const Student = model<StudentDocument>("Student", studentSchema);
export default Student;