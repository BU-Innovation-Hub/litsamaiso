import { model, Schema } from "mongoose";

export interface RoleDocument {
  name: string;
  functionalities: string[];
}

const roleSchema = new Schema<RoleDocument>(
  {
    name: { type: String, required: true, trim: true, unique: true },
    functionalities: { type: [String], default: [] },
  },
  {
    timestamps: true,
  },
);

export const Role = model<RoleDocument>("Role", roleSchema);
export default Role;