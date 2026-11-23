import { model, Schema, type Types } from "mongoose";

export type RoomType = "lecture theatre" | "30-seater" | "computer lab" | "lab";

export interface RoomDocument {
  institution: Types.ObjectId;
  code: string;
  building?: string;
  capacity: number;
  isComputerized: boolean;
  roomType: RoomType;
  // Rooms out of use keep their history on past timetables but get no new classes
  active: boolean;
}

const roomSchema = new Schema<RoomDocument>(
  {
    institution: { type: Schema.Types.ObjectId, ref: "Institution", required: true },
    code: { type: String, required: true, trim: true, uppercase: true },
    building: { type: String, trim: true },
    capacity: { type: Number, required: true, min: 1 },
    isComputerized: { type: Boolean, default: false },
    roomType: { type: String, enum: ["lecture theatre", "30-seater", "computer lab", "lab"], default: "30-seater" },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

roomSchema.index({ institution: 1, code: 1 }, { unique: true });

export const Room = model<RoomDocument>("Room", roomSchema);
export default Room;
