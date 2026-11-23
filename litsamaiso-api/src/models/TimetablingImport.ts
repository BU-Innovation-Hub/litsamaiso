import { model, Schema, type Types } from "mongoose";

// One spreadsheet import that changed something, in the term it was imported into. Registry is warned
// before importing into a term that already has one.
export interface TimetablingImportDocument {
  institution: Types.ObjectId;
  academicYear: string;
  semester: number;
  fileName: string;
  importedBy?: Types.ObjectId;
  importedByEmail?: string;
  changes: number;
  sheets: Array<{ sheet: string; kind: string; rows: number; added: number; updated: number; unchanged: number; skipped: number }>;
  createdAt?: Date;
  updatedAt?: Date;
}

const timetablingImportSchema = new Schema<TimetablingImportDocument>(
  {
    institution: { type: Schema.Types.ObjectId, ref: "Institution", required: true },
    academicYear: { type: String, required: true, trim: true },
    semester: { type: Number, required: true, enum: [1, 2] },
    fileName: { type: String, required: true, trim: true, maxlength: 255 },
    importedBy: { type: Schema.Types.ObjectId, ref: "User" },
    importedByEmail: { type: String, trim: true },
    changes: { type: Number, required: true, min: 0 },
    sheets: { type: Schema.Types.Mixed, default: [] },
  },
  { timestamps: true },
);

// The latest import for a term
timetablingImportSchema.index({ institution: 1, academicYear: 1, semester: 1, createdAt: -1 });

export const TimetablingImport = model<TimetablingImportDocument>("TimetablingImport", timetablingImportSchema);
export default TimetablingImport;
