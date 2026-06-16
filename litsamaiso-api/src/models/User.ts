import { model, Schema, type Types } from "mongoose";

export interface UserDocument {
  email: string;
  password: string;
  name?: string;
  role: Types.ObjectId;
  institution: Types.ObjectId;
  studentId?: string;
  faceDescriptor: number[];
  faceImageUrl?: string;
  passwordResetTokenHash?: string;
  passwordResetTokenExpiresAt?: Date;
}

const userSchema = new Schema<UserDocument>(
  {
    name: { type: String, trim: true },
    email: { type: String, required: true, trim: true, unique: true },
    password: { type: String, required: true, select: false },
    role: { type: Schema.Types.ObjectId, ref: "Role", required: true },
    institution: {
      type: Schema.Types.ObjectId,
      ref: "Institution",
      required: true,
    },
    studentId: { type: String, trim: true, unique: true, sparse: true },
    faceDescriptor: { type: [Number], default: [] },
    faceImageUrl: { type: String, trim: true },
    passwordResetTokenHash: { type: String, select: false },
    passwordResetTokenExpiresAt: { type: Date, select: false },
  },
  {
    timestamps: true,
  },
);

export const User = model<UserDocument>("User", userSchema);
export default User;