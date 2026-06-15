import { model, Schema, type Types } from "mongoose";

export interface PositionDocument {
  electionId: Types.ObjectId;
  title: string;
  description?: string;
  maxVotesAllowed: number;
  displayOrder: number;
  isActive: boolean;
  deletedAt?: Date | null;
  deletedBy?: Types.ObjectId | null;
}

const positionSchema = new Schema<PositionDocument>(
  {
    electionId: {
      type: Schema.Types.ObjectId,
      ref: "Election",
      required: true,
    },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    maxVotesAllowed: { type: Number, required: true, default: 1, min: 1 },
    displayOrder: { type: Number, required: true },
    isActive: { type: Boolean, default: true },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  {
    timestamps: true,
  },
);

positionSchema.index({ electionId: 1, displayOrder: 1 }, { unique: true, partialFilterExpression: { deletedAt: null } });
positionSchema.index({ electionId: 1, title: 1 }, { unique: true, partialFilterExpression: { deletedAt: null } });

export const Position = model<PositionDocument>("Position", positionSchema);
export default Position;
