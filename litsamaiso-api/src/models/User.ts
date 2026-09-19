import { model, Schema, type Types } from "mongoose";

export interface UserDocument {
  email: string;
  password: string;
  name?: string;
  role: Types.ObjectId;
  institution: Types.ObjectId;
  studentId?: string;
  borrowerNumber?: string;
  studentCardUrl?: string;
  faceDescriptor: number[];
  faceImageUrl?: string;
  financialInfoConsentAt?: Date;
  passwordResetTokenHash?: string;
  passwordResetTokenExpiresAt?: Date;
  tour?: {
    completedAt?: Date;
    dismissedAt?: Date;
    version?: number;
  };
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
    borrowerNumber: { type: String, trim: true },
    studentCardUrl: { type: String, trim: true },
    faceDescriptor: { type: [Number], default: [] },
    faceImageUrl: { type: String, trim: true },
    financialInfoConsentAt: { type: Date },
    passwordResetTokenHash: { type: String, select: false },
    passwordResetTokenExpiresAt: { type: Date, select: false },
    // Guided product tour progress (per user, so it follows them across devices).
    tour: {
      completedAt: { type: Date },
      dismissedAt: { type: Date },
      version: { type: Number },
    },
  },
  {
    timestamps: true,
  },
);

export const User = model<UserDocument>("User", userSchema);
export default User;
