import { model, Schema, type Types } from "mongoose";
import { SEMESTERS } from "../constants/timetabling.js";

export type TimetableRunStatus = "draft" | "published" | "archived";

export interface UnplacedSessionRecord {
  module: Types.ObjectId;
  moduleCode: string;
  session: number;
  batch: number;
  reason: string;
}

// One generated timetable for a semester. Registry reviews the draft, then publishes it;
// publishing archives the previously published one.
export interface TimetableRunDocument {
  institution: Types.ObjectId;
  academicYear: string;
  semester: number;
  status: TimetableRunStatus;
  rules: { days: number; dayStartHour: number; dayEndHour: number; minLecturerGapHours: number };
  unplaced: UnplacedSessionRecord[];
  generatedBy: Types.ObjectId;
  publishedBy?: Types.ObjectId;
  publishedAt?: Date;
  createdAt?: Date;
}

const timetableRunSchema = new Schema<TimetableRunDocument>(
  {
    institution: { type: Schema.Types.ObjectId, ref: "Institution", required: true },
    academicYear: { type: String, required: true, trim: true },
    semester: { type: Number, required: true, enum: SEMESTERS },
    status: { type: String, enum: ["draft", "published", "archived"], default: "draft" },
    rules: {
      days: { type: Number, required: true },
      dayStartHour: { type: Number, required: true },
      dayEndHour: { type: Number, required: true },
      minLecturerGapHours: { type: Number, required: true },
    },
    unplaced: {
      type: [
        {
          _id: false,
          module: { type: Schema.Types.ObjectId, ref: "CourseModule", required: true },
          moduleCode: { type: String, required: true },
          session: { type: Number, required: true },
          batch: { type: Number, default: 1 },
          reason: { type: String, required: true },
        },
      ],
      default: [],
    },
    generatedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    publishedBy: { type: Schema.Types.ObjectId, ref: "User" },
    publishedAt: { type: Date },
  },
  { timestamps: true },
);

timetableRunSchema.index({ institution: 1, academicYear: 1, semester: 1, status: 1, createdAt: -1 });
// At most one published timetable per semester
timetableRunSchema.index(
  { institution: 1, academicYear: 1, semester: 1 },
  { unique: true, partialFilterExpression: { status: "published" } },
);

export const TimetableRun = model<TimetableRunDocument>("TimetableRun", timetableRunSchema);
export default TimetableRun;
