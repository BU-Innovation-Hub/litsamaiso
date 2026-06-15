import { model, Schema } from "mongoose";

export interface AuditLogDocument {
  action: string;
  actorId?: string;
  actorEmail?: string;
  actorRole?: string;
  targetCollection?: string;
  targetId?: string;
  details?: Record<string, unknown>;
}

const auditLogSchema = new Schema<AuditLogDocument>(
  {
    action: { type: String, required: true, trim: true },
    actorId: { type: String, trim: true },
    actorEmail: { type: String, trim: true },
    actorRole: { type: String, trim: true },
    targetCollection: { type: String, trim: true },
    targetId: { type: String, trim: true },
    details: { type: Schema.Types.Mixed, default: {} },
  },
  {
    timestamps: true,
  },
);

export const AuditLog = model<AuditLogDocument>("AuditLog", auditLogSchema);
export default AuditLog;