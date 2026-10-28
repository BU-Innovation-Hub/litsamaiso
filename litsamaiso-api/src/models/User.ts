import { model, Schema, type Types } from "mongoose";

export interface UserDocument {
  email: string;
  password: string;
  name?: string;
  role: Types.ObjectId;
  additionalRoles: Types.ObjectId[];
  institution: Types.ObjectId;
  studentId?: string;
  borrowerNumber?: string;
  studentCardUrl?: string;
  faceDescriptor: number[];
  faceImageUrl?: string;
  financialInfoConsentAt?: Date;
  passwordResetTokenHash?: string;
  passwordResetTokenExpiresAt?: Date;
  totpSecretEncrypted?: string;
  totpEnabledAt?: Date;
  totpLastUsedStep?: number;
  totpFailedAttempts?: number;
  totpLockedUntil?: Date;
  photoCaptureGrantHash?: string;
  photoCaptureGrantExpiresAt?: Date;
}

const userSchema = new Schema<UserDocument>(
  {
    name: { type: String, trim: true },
    email: { type: String, required: true, trim: true, unique: true },
    password: { type: String, required: true, select: false },
    role: { type: Schema.Types.ObjectId, ref: "Role", required: true },
    // Roles held alongside the primary one, e.g. a Student appointed to the IEC
    additionalRoles: { type: [{ type: Schema.Types.ObjectId, ref: "Role" }], default: [] },
    institution: {
      type: Schema.Types.ObjectId,
      ref: "Institution",
      required: true,
    },
    studentId: { type: String, trim: true, unique: true, sparse: true },
    borrowerNumber: { type: String, trim: true },
    studentCardUrl: { type: String, trim: true },
    // Face embedding from the profile photo. Hidden by default so it's never sent to a client.
    faceDescriptor: { type: [Number], default: [], select: false },
    faceImageUrl: { type: String, trim: true },
    financialInfoConsentAt: { type: Date },
    passwordResetTokenHash: { type: String, select: false },
    passwordResetTokenExpiresAt: { type: Date, select: false },
    // Authenticator app (TOTP) key, encrypted with TOTP_ENCRYPTION_KEY. Only students have one.
    totpSecretEncrypted: { type: String, select: false },
    totpEnabledAt: { type: Date },
    // Time step of the last accepted code, so a code can't be used twice
    totpLastUsedStep: { type: Number, select: false },
    totpFailedAttempts: { type: Number, default: 0, select: false },
    totpLockedUntil: { type: Date, select: false },
    // Hash of the single-use grant a code unlocks for one profile photo save
    photoCaptureGrantHash: { type: String, select: false },
    photoCaptureGrantExpiresAt: { type: Date, select: false },
  },
  {
    timestamps: true,
  },
);

export const User = model<UserDocument>("User", userSchema);
export default User;
