import { model, Schema, type Types } from "mongoose";
import { MAX_SESSION_HOURS, MAX_SESSIONS_PER_WEEK, SEMESTERS } from "../constants/timetabling.js";
import { ACADEMIC_YEAR_MESSAGE, isAcademicYear } from "../utils/validation.js";

// A module taught in one semester. Its students belong to its lecturer for timetabling.
export interface CourseModuleDocument {
  institution: Types.ObjectId;
  code: string;
  name: string;
  lecturer: Types.ObjectId;
  academicYear: string;
  semester: number;
  requiresComputers: boolean;
  sessionsPerWeek: number;
  durationHours: number;
  students: Types.ObjectId[];
}

const courseModuleSchema = new Schema<CourseModuleDocument>(
  {
    institution: { type: Schema.Types.ObjectId, ref: "Institution", required: true },
    code: { type: String, required: true, trim: true, uppercase: true },
    name: { type: String, required: true, trim: true },
    lecturer: { type: Schema.Types.ObjectId, ref: "Lecturer", required: true },
    academicYear: {
      type: String,
      required: true,
      trim: true,
      validate: { validator: isAcademicYear, message: ACADEMIC_YEAR_MESSAGE },
    },
    semester: { type: Number, required: true, enum: SEMESTERS },
    requiresComputers: { type: Boolean, default: false },
    sessionsPerWeek: { type: Number, required: true, min: 1, max: MAX_SESSIONS_PER_WEEK, default: 1 },
    durationHours: { type: Number, required: true, min: 1, max: MAX_SESSION_HOURS, default: 2 },
    students: { type: [{ type: Schema.Types.ObjectId, ref: "Student" }], default: [] },
  },
  { timestamps: true },
);

courseModuleSchema.index({ institution: 1, academicYear: 1, semester: 1, code: 1 }, { unique: true });
courseModuleSchema.index({ institution: 1, lecturer: 1 });

export const CourseModule = model<CourseModuleDocument>("CourseModule", courseModuleSchema);
export default CourseModule;
