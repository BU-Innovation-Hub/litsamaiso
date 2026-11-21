import { model, Schema, type Types } from "mongoose";

// One weekly class on a timetable: a module in a room at a fixed time
export interface ClassSessionDocument {
  institution: Types.ObjectId;
  run: Types.ObjectId;
  module: Types.ObjectId;
  room: Types.ObjectId;
  day: number;
  startHour: number;
  endHour: number;
  // Every hour the class occupies, e.g. [9, 10] for 09:00-11:00
  hours: number[];
  batch: number;
}

const classSessionSchema = new Schema<ClassSessionDocument>(
  {
    institution: { type: Schema.Types.ObjectId, ref: "Institution", required: true },
    run: { type: Schema.Types.ObjectId, ref: "TimetableRun", required: true },
    module: { type: Schema.Types.ObjectId, ref: "CourseModule", required: true },
    room: { type: Schema.Types.ObjectId, ref: "Room", required: true },
    day: { type: Number, required: true, min: 0 },
    startHour: { type: Number, required: true },
    endHour: { type: Number, required: true },
    hours: { type: [Number], required: true },
    batch: { type: Number, default: 1, min: 1 },
  },
  { timestamps: true },
);

// The database's own guard against room clashes. `hours` is an array, so the unique key is
// checked per hour: two sessions can never hold the same room in the same hour, even when
// two Registry users move classes at the same moment.
classSessionSchema.index({ run: 1, room: 1, day: 1, hours: 1 }, { unique: true });
classSessionSchema.index({ run: 1, module: 1 });

export const hoursBetween = (startHour: number, endHour: number) =>
  Array.from({ length: endHour - startHour }, (_, index) => startHour + index);

export const ClassSession = model<ClassSessionDocument>("ClassSession", classSessionSchema);
export default ClassSession;
