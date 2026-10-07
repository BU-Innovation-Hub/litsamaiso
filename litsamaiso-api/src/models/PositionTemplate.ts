import { model, Schema, type Types } from "mongoose";

// Institution-level list of standard positions, copied onto each new election
export interface PositionTemplateDocument {
  institution: Types.ObjectId;
  title: string;
  description?: string;
  maxVotesAllowed: number;
  displayOrder: number;
}

const positionTemplateSchema = new Schema<PositionTemplateDocument>(
  {
    institution: {
      type: Schema.Types.ObjectId,
      ref: "Institution",
      required: true,
    },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    maxVotesAllowed: { type: Number, required: true, default: 1, min: 1 },
    displayOrder: { type: Number, required: true },
  },
  {
    timestamps: true,
  },
);

positionTemplateSchema.index({ institution: 1, title: 1 }, { unique: true });

export const PositionTemplate = model<PositionTemplateDocument>("PositionTemplate", positionTemplateSchema);
export default PositionTemplate;
